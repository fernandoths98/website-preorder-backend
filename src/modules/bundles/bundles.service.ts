import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Bundle } from './entities/bundle.entity';
import { BundleItem } from './entities/bundle-item.entity';
import {
  PoStatus,
  ProductBatchPrice,
} from '../products/entities/product-batch-price.entity';
import { BatchesService } from '../batches/batches.service';
import { priceBundle, type PricingMember } from './bundle-pricing';
import type { BundleMemberView, BundleView } from './interfaces/bundle.interface';

/** Worst-wins, so one sold-out member takes the whole paket down. */
const STATUS_RANK: Record<PoStatus, number> = {
  [PoStatus.AVAILABLE]: 0,
  [PoStatus.LIMITED]: 1,
  [PoStatus.SOLD_OUT]: 2,
  [PoStatus.HIDDEN]: 3,
};

@Injectable()
export class BundlesService {
  private readonly logger = new Logger(BundlesService.name);

  constructor(
    @InjectRepository(Bundle)
    private readonly bundleRepo: Repository<Bundle>,
    @InjectRepository(BundleItem)
    private readonly itemRepo: Repository<BundleItem>,
    @InjectRepository(ProductBatchPrice)
    private readonly priceRepo: Repository<ProductBatchPrice>,
    private readonly batchesService: BatchesService,
  ) {}

  // ---------- Storefront ----------

  /** Active pakets, priced against the current batch. Sold-out ones stay
   *  visible but unbuyable — hiding them looks like the site is broken. */
  async findAll(batchId?: string): Promise<BundleView[]> {
    const resolved = batchId ?? (await this.batchesService.resolveOpenBatchId());

    const bundles = await this.bundleRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    if (!bundles.length) return [];

    const views = await this.priceMany(bundles, resolved);
    return views.filter((v) => v.poStatus !== PoStatus.HIDDEN);
  }

  async findOneBySlug(slug: string, batchId?: string): Promise<BundleView> {
    const resolved = batchId ?? (await this.batchesService.resolveOpenBatchId());

    const bundle = await this.bundleRepo.findOne({ where: { slug, isActive: true } });
    if (!bundle) throw new NotFoundException(`Paket "${slug}" tidak ditemukan`);

    const [view] = await this.priceMany([bundle], resolved);
    if (!view) throw new NotFoundException(`Paket "${slug}" belum punya isi`);
    return view;
  }

  // ---------- Shared with OrdersService ----------

  /**
   * Priced paket by id — used at checkout to rebuild the lines server-side.
   * The client never dictates a paket price.
   */
  async priceByIds(ids: string[], batchId: string): Promise<Map<string, BundleView>> {
    if (!ids.length) return new Map();

    const bundles = await this.bundleRepo.find({
      where: { id: In(ids), isActive: true },
    });
    const views = await this.priceMany(bundles, batchId);
    return new Map(views.map((v) => [v.bundleId, v]));
  }

  /**
   * The per-unit margins that must be written onto order_items for one paket.
   * Recomputed rather than passed around so it can never drift from the
   * price the customer was shown.
   */
  async resolveOrderLines(
    bundleId: string,
    batchId: string,
  ): Promise<Array<{ productId: string; qty: number; basePrice: number; margin: number }>> {
    const members = await this.loadMembers([bundleId], batchId);
    const bundle = await this.bundleRepo.findOne({ where: { id: bundleId } });
    if (!bundle) throw new NotFoundException(`Paket ${bundleId} tidak ditemukan`);

    const rows = members.get(bundleId) ?? [];
    const pricing = priceBundle(
      rows.map<PricingMember>((r) => ({
        productId: r.productId,
        basePrice: r.basePrice,
        looseMargin: r.margin,
        qty: r.qty,
      })),
      bundle.margin,
    );

    return pricing.members.map((m) => ({
      productId: m.productId,
      qty: m.qty,
      basePrice: m.basePrice,
      margin: m.bundleUnitMargin,
    }));
  }

  // ---------- internals ----------

  private async priceMany(bundles: Bundle[], batchId: string): Promise<BundleView[]> {
    if (!bundles.length) return [];
    const membersByBundle = await this.loadMembers(
      bundles.map((b) => b.id),
      batchId,
    );

    return bundles
      .map((b) => {
        const rows = membersByBundle.get(b.id) ?? [];
        if (!rows.length) return null;

        const pricing = priceBundle(
          rows.map<PricingMember>((r) => ({
            productId: r.productId,
            basePrice: r.basePrice,
            looseMargin: r.margin,
            qty: r.qty,
          })),
          b.margin,
        );

        // A member the admin never published to this batch is as blocking as
        // a sold-out one — sourcing would have nothing to buy.
        const missing = rows.filter((r) => !r.published);
        const worst = rows.reduce<PoStatus>(
          (acc, r) =>
            STATUS_RANK[r.poStatus] > STATUS_RANK[acc] ? r.poStatus : acc,
          PoStatus.AVAILABLE,
        );
        const poStatus = missing.length ? PoStatus.SOLD_OUT : worst;

        const members: BundleMemberView[] = rows.map((r) => ({
          productId: r.productId,
          sku: r.sku,
          slug: r.slug,
          name: r.name,
          unit: r.unit,
          imageUrl: r.imageUrl,
          qty: r.qty,
          loosePrice: r.basePrice + r.margin,
          poStatus: r.poStatus,
        }));

        const view: BundleView = {
          bundleId: b.id,
          slug: b.slug,
          name: b.name,
          tagline: b.tagline,
          description: b.description,
          targetMarket: b.targetMarket,
          imageUrl: b.imageUrl,
          itemsCount: rows.reduce((n, r) => n + r.qty, 0),
          modal: pricing.modal,
          margin: b.margin,
          price: pricing.price,
          loosePrice: pricing.loosePrice,
          savings: pricing.savings,
          maxQty: b.maxQty,
          poStatus,
          blockedBy: [
            ...missing.map((m) => `${m.name} (belum dipublish ke batch ini)`),
            ...rows
              .filter((r) => r.published && r.poStatus !== PoStatus.AVAILABLE)
              .map((r) => `${r.name} (${r.poStatus})`),
          ],
          members,
        };
        return view;
      })
      .filter((v): v is BundleView => v !== null);
  }

  /**
   * One query for every member of every requested paket, priced from
   * product_batch_prices (the weekly price), falling back to the product's
   * own price when the admin has not published it to this batch yet.
   */
  private async loadMembers(bundleIds: string[], batchId: string) {
    const rows = await this.itemRepo
      .createQueryBuilder('bi')
      .innerJoin('bi.product', 'p')
      .leftJoin(
        ProductBatchPrice,
        'pbp',
        'pbp.product_id = p.id AND pbp.batch_id = :batchId',
        { batchId },
      )
      .where('bi.bundle_id IN (:...bundleIds)', { bundleIds })
      .andWhere('p.is_active = 1')
      .andWhere('p.deleted_at IS NULL')
      .orderBy('bi.sort_order', 'ASC')
      .select([
        'bi.bundle_id  AS bundleId',
        'bi.product_id AS productId',
        'bi.qty        AS qty',
        'p.sku         AS sku',
        'p.slug        AS slug',
        'p.name        AS name',
        'p.unit        AS unit',
        'p.image_url   AS imageUrl',
        'COALESCE(pbp.base_price, p.base_price) AS basePrice',
        'COALESCE(pbp.margin, p.margin)         AS margin',
        'COALESCE(pbp.po_status, :fallback)     AS poStatus',
        'pbp.id IS NOT NULL                     AS published',
      ])
      .setParameter('fallback', PoStatus.AVAILABLE)
      .getRawMany<{
        bundleId: string;
        productId: string;
        qty: number;
        sku: string;
        slug: string;
        name: string;
        unit: string;
        imageUrl: string | null;
        basePrice: string;
        margin: string;
        poStatus: PoStatus;
        published: number;
      }>();

    const grouped = new Map<string, Array<Omit<(typeof rows)[number], 'basePrice' | 'margin' | 'published'> & {
      basePrice: number;
      margin: number;
      published: boolean;
    }>>();

    for (const r of rows) {
      const key = String(r.bundleId);
      const list = grouped.get(key) ?? [];
      list.push({
        ...r,
        productId: String(r.productId),
        qty: Number(r.qty),
        basePrice: Number(r.basePrice),
        margin: Number(r.margin),
        published: Boolean(Number(r.published)),
      });
      grouped.set(key, list);
    }
    return grouped;
  }
}

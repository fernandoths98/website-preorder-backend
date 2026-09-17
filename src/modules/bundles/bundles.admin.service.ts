import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import slugify from 'slugify';

import { Bundle } from './entities/bundle.entity';
import { BundleItem } from './entities/bundle-item.entity';
import { Product } from '../products/entities/product.entity';
import { BundlesService } from './bundles.service';
import { BatchesService } from '../batches/batches.service';
import { CreateBundleDto, UpdateBundleDto } from './dto/upsert-bundle.dto';
import type { BundleView } from './interfaces/bundle.interface';

@Injectable()
export class BundlesAdminService {
  private readonly logger = new Logger(BundlesAdminService.name);

  constructor(
    @InjectRepository(Bundle)
    private readonly bundleRepo: Repository<Bundle>,
    @InjectRepository(BundleItem)
    private readonly itemRepo: Repository<BundleItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly bundlesService: BundlesService,
    private readonly batchesService: BatchesService,
    private readonly dataSource: DataSource,
  ) {}

  /** Inactive pakets included — the admin needs to see what he switched off. */
  async findAll(batchId?: string): Promise<BundleView[]> {
    const resolved = batchId ?? (await this.batchesService.resolveOpenBatchId());
    const bundles = await this.bundleRepo.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const ids = bundles.map((b) => b.id);
    if (!ids.length) return [];

    const priced = await this.bundlesService.priceByIds(ids, resolved);
    // priceByIds filters to active; fall back to a bare row for the rest so
    // an inactive paket still shows up in the table.
    return bundles.map(
      (b) =>
        priced.get(b.id) ?? {
          bundleId: b.id,
          slug: b.slug,
          name: b.name,
          tagline: b.tagline,
          description: b.description,
          targetMarket: b.targetMarket,
          imageUrl: b.imageUrl,
          itemsCount: 0,
          modal: 0,
          margin: b.margin,
          price: 0,
          loosePrice: 0,
          savings: 0,
          maxQty: b.maxQty,
          poStatus: 'hidden' as BundleView['poStatus'],
          blockedBy: b.isActive ? ['Paket belum punya isi'] : ['Paket nonaktif'],
          members: [],
        },
    );
  }

  async create(dto: CreateBundleDto): Promise<BundleView> {
    const slug = dto.slug ?? slugify(dto.name, { lower: true, strict: true });

    const clash = await this.bundleRepo.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (clash) throw new ConflictException(`Slug "${slug}" sudah dipakai`);

    await this.assertProductsExist(dto.items.map((i) => i.productId));
    await this.assertMarginSane(dto.items, dto.margin);

    const id = await this.dataSource.transaction(async (manager) => {
      const bundle = await manager.getRepository(Bundle).save(
        manager.getRepository(Bundle).create({
          slug,
          name: dto.name,
          tagline: dto.tagline ?? null,
          description: dto.description ?? null,
          targetMarket: dto.targetMarket ?? null,
          imageUrl: dto.imageUrl ?? null,
          margin: dto.margin,
          maxQty: dto.maxQty ?? null,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        }),
      );
      await this.replaceItems(manager.getRepository(BundleItem), bundle.id, dto.items);
      return bundle.id;
    });

    return this.priceOne(id);
  }

  async update(id: string, dto: UpdateBundleDto): Promise<BundleView> {
    const bundle = await this.bundleRepo.findOne({ where: { id } });
    if (!bundle) throw new NotFoundException(`Paket ${id} tidak ditemukan`);

    if (dto.items) await this.assertProductsExist(dto.items.map((i) => i.productId));

    // Margin and contents can each change alone, so validate the combination
    // that will actually be in effect.
    const effectiveItems =
      dto.items ??
      (await this.itemRepo.find({ where: { bundleId: id } })).map((i) => ({
        productId: String(i.productId),
        qty: i.qty,
      }));
    await this.assertMarginSane(effectiveItems, dto.margin ?? bundle.margin);

    await this.dataSource.transaction(async (manager) => {
      Object.assign(bundle, {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.tagline !== undefined && { tagline: dto.tagline }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.targetMarket !== undefined && { targetMarket: dto.targetMarket }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.margin !== undefined && { margin: dto.margin }),
        ...(dto.maxQty !== undefined && { maxQty: dto.maxQty }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      });
      await manager.getRepository(Bundle).save(bundle);

      if (dto.items) {
        await this.replaceItems(manager.getRepository(BundleItem), id, dto.items);
      }
    });

    return this.priceOne(id);
  }

  async softRemove(id: string): Promise<void> {
    const res = await this.bundleRepo.softDelete(id);
    if (!res.affected) throw new NotFoundException(`Paket ${id} tidak ditemukan`);
  }

  // ---------- internals ----------

  private async replaceItems(
    repo: Repository<BundleItem>,
    bundleId: string,
    items: Array<{ productId: string; qty: number; sortOrder?: number }>,
  ): Promise<void> {
    // Full replace rather than diff: paket contents are small and this keeps
    // removals honest.
    await repo.delete({ bundleId });
    await repo.insert(
      items.map((i, idx) => ({
        bundleId,
        productId: i.productId,
        qty: i.qty,
        sortOrder: i.sortOrder ?? idx + 1,
      })),
    );
  }

  private async assertProductsExist(productIds: string[]): Promise<void> {
    const unique = [...new Set(productIds)];
    if (unique.length !== productIds.length) {
      throw new BadRequestException('Produk duplikat dalam satu paket');
    }
    const found = await this.productRepo.count({ where: { id: In(unique) } });
    if (found !== unique.length) {
      throw new BadRequestException('Ada produk yang tidak ditemukan');
    }
  }

  /**
   * A paket whose margin exceeds the per-item margins it replaces costs more
   * than buying the same items loose — a bug, not a product. Checked BEFORE
   * anything is written so a rejected paket leaves no row behind.
   */
  private async assertMarginSane(
    items: Array<{ productId: string; qty: number }>,
    margin: number,
  ): Promise<void> {
    const products = await this.productRepo.find({
      where: { id: In(items.map((i) => i.productId)) },
      select: { id: true, margin: true },
    });
    const marginById = new Map(products.map((p) => [String(p.id), Number(p.margin)]));

    const looseMargin = items.reduce(
      (sum, i) => sum + (marginById.get(String(i.productId)) ?? 0) * i.qty,
      0,
    );

    if (margin > looseMargin) {
      throw new BadRequestException(
        `Margin paket (Rp${margin.toLocaleString('id-ID')}) melebihi total margin satuan ` +
          `(Rp${looseMargin.toLocaleString('id-ID')}). Paket jadi lebih mahal daripada beli satuan.`,
      );
    }
  }

  private async priceOne(id: string): Promise<BundleView> {
    const batchId = await this.batchesService.resolveOpenBatchId();
    const view = (await this.bundlesService.priceByIds([id], batchId)).get(id);
    if (!view) throw new NotFoundException(`Paket ${id} tidak bisa dihitung`);
    return view;
  }
}

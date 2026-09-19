import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import slugify from 'slugify';

import { Product } from './entities/product.entity';
import { PoStatus, ProductBatchPrice } from './entities/product-batch-price.entity';
import { BatchesService } from '../batches/batches.service';
import type { ImportRowDto } from './dto/import-products.dto';
import type {
  ImportCommitResult,
  ImportPreview,
  ImportRowResult,
} from './interfaces/import-result.interface';

const MARGIN_MIN = 0;
/** DECIMAL(12,2) holds at most 9_999_999_999.99 — reject before MySQL does. */
const PRICE_MAX = 9_999_999_999;
const VALID_STATUS = Object.values(PoStatus) as string[];

@Injectable()
export class ProductsImportService {
  private readonly logger = new Logger(ProductsImportService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductBatchPrice)
    private readonly priceRepo: Repository<ProductBatchPrice>,
    private readonly batchesService: BatchesService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Dry run. Never writes — returns exactly what a commit would do so the
   * operator can eyeball it first. Same validation path as commit, so what
   * you approve is what you get.
   */
  async preview(rows: ImportRowDto[], batchId?: number): Promise<ImportPreview> {
    const batch = batchId
      ? await this.batchesService.findOne(String(batchId))
      : await this.batchesService.current();

    const skus = rows
      .map((r) => (r.sku ?? '').trim().toUpperCase())
      .filter(Boolean);

    // slug is UNIQUE too, so a row can collide on slug while its SKU looks
    // new. Look both up, or the insert dies on uq_products_slug at commit
    // time and the operator just sees a 500.
    const slugs = rows
      .map((r) => slugify((r.name ?? '').trim(), { lower: true, strict: true }))
      .filter(Boolean);

    const existing =
      skus.length || slugs.length
        ? await this.productRepo.find({
            where: [{ sku: In(skus.length ? skus : ['']) }, { slug: In(slugs.length ? slugs : ['']) }],
            // Object form, not an array: TS widens a string[] literal and it
            // no longer matches FindOptionsSelect<Product>.
            select: { id: true, sku: true, slug: true, name: true, basePrice: true, margin: true },
          })
        : [];

    const bySku = new Map(existing.map((p) => [p.sku, p]));
    const bySlug = new Map(existing.map((p) => [p.slug, p]));

    // Duplicate SKUs inside the file itself — first wins, rest flagged.
    const seen = new Set<string>();

    const results: ImportRowResult[] = rows.map((raw, index) =>
      this.validateRow(raw, index, bySku, bySlug, seen),
    );

    const ok = results.filter((r) => r.action !== 'error' && r.data);

    return {
      batchId: batch.id,
      batchCode: batch.code,
      rows: results,
      summary: {
        total: results.length,
        create: results.filter((r) => r.action === 'create').length,
        update: results.filter((r) => r.action === 'update').length,
        error: results.filter((r) => r.action === 'error').length,
        totalModal: ok.reduce((n, r) => n + r.data!.basePrice, 0),
        totalMargin: ok.reduce((n, r) => n + r.data!.margin, 0),
      },
    };
  }

  /**
   * Applies only the rows handed back by the UI, re-validated server-side.
   * One transaction: a bad row late in the file rolls the whole import back
   * rather than leaving the catalog half-updated.
   */
  async commit(
    rows: ImportRowDto[],
    batchId?: number,
    publishToBatch = true,
  ): Promise<ImportCommitResult> {
    const preview = await this.preview(rows, batchId);
    const valid = preview.rows.filter((r) => r.action !== 'error' && r.data);

    let created = 0;
    let updated = 0;
    let published = 0;

    await this.dataSource.transaction(async (manager) => {
      const products = manager.getRepository(Product);
      const prices = manager.getRepository(ProductBatchPrice);

      for (const row of valid) {
        const d = row.data!;
        // Match on either key — the row may be an update under a different
        // SKU but the same generated slug.
        let product = await products.findOne({
          where: [{ sku: d.sku }, { slug: d.slug }],
        });

        if (product) {
          product.name = d.name;
          product.category = d.category;
          product.unit = d.unit;
          product.basePrice = d.basePrice;
          product.margin = d.margin;
          if (d.imageUrl) product.imageUrl = d.imageUrl;
          await products.save(product);
          updated += 1;
        } else {
          product = await products.save(
            products.create({
              sku: d.sku,
              slug: d.slug,
              name: d.name,
              category: d.category,
              unit: d.unit,
              imageUrl: d.imageUrl,
              basePrice: d.basePrice,
              margin: d.margin,
              isActive: true,
            }),
          );
          created += 1;
        }

        if (publishToBatch) {
          await prices.upsert(
            {
              batchId: preview.batchId,
              productId: product.id,
              basePrice: d.basePrice,
              margin: d.margin,
              maxQty: d.maxQty,
              poStatus: d.poStatus as PoStatus,
            },
            { conflictPaths: ['batchId', 'productId'] },
          );
          published += 1;
        }
      }
    });

    this.logger.log(
      `Import batch ${preview.batchCode}: +${created} new, ~${updated} updated, ${published} published`,
    );

    return {
      created,
      updated,
      published,
      skipped: preview.rows.length - valid.length,
    };
  }

  // ---------------- internals ----------------

  private validateRow(
    raw: ImportRowDto,
    index: number,
    bySku: Map<string, Product>,
    bySlug: Map<string, Product>,
    seen: Set<string>,
  ): ImportRowResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const sku = (raw.sku ?? '').trim().toUpperCase();
    const name = (raw.name ?? '').trim();

    if (!sku) errors.push('SKU kosong');
    if (!name) errors.push('Nama produk kosong');
    if (sku && seen.has(sku)) errors.push(`SKU ${sku} duplikat di file ini`);
    if (sku) seen.add(sku);

    const basePrice = this.toNumber(raw.basePrice);
    const margin = this.toNumber(raw.margin);

    if (basePrice === null) errors.push('Harga modal bukan angka');
    else if (basePrice < 0) errors.push('Harga modal negatif');
    else if (basePrice > PRICE_MAX) {
      errors.push(
        `Harga modal terlalu besar (${basePrice}). Cek apakah selnya berisi ` +
          'lebih dari satu harga, misalnya harga dus dan harga pcs sekaligus.',
      );
    } else if (basePrice === 0) warnings.push('Harga modal 0');

    if (margin === null) errors.push('Margin bukan angka');
    else if (margin < MARGIN_MIN || margin > PRICE_MAX) {
      errors.push('Margin tidak valid');
    }

    const maxQty = raw.maxQty?.trim() ? this.toNumber(raw.maxQty) : null;
    if (raw.maxQty?.trim() && (maxQty === null || maxQty < 1)) {
      errors.push('Maks qty harus bilangan bulat ≥ 1');
    }

    const poStatus = (raw.poStatus ?? 'available').trim().toLowerCase();
    if (!VALID_STATUS.includes(poStatus)) {
      errors.push(`Status PO tidak dikenal: ${poStatus}`);
    }

    const slug = name ? slugify(name, { lower: true, strict: true }) : '';
    const prior = (sku ? bySku.get(sku) : undefined) ?? (slug ? bySlug.get(slug) : undefined);

    // Same product name already stored under a different SKU. Writing it
    // would violate uq_products_slug, so flag it instead of crashing.
    const slugOwner = slug ? bySlug.get(slug) : undefined;
    if (slugOwner && sku && slugOwner.sku !== sku) {
      errors.push(
        `Nama ini sudah dipakai produk lain dengan SKU ${slugOwner.sku}. ` +
          `Samakan SKU-nya, atau ubah nama produknya.`,
      );
    }
    const imageUrl = (raw.imageUrl ?? '').trim() || null;
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      warnings.push('URL gambar tidak diawali http(s)');
    }

    if (errors.length) {
      return {
        index,
        action: 'error',
        errors,
        warnings,
        data: null,
        existing: prior
          ? { name: prior.name, basePrice: prior.basePrice, margin: prior.margin }
          : null,
      };
    }

    return {
      index,
      action: prior ? 'update' : 'create',
      errors,
      warnings,
      data: {
        sku,
        name,
        slug,
        category: (raw.category ?? '').trim() || null,
        unit: (raw.unit ?? '').trim() || 'pcs',
        imageUrl,
        basePrice: basePrice!,
        margin: margin!,
        sellingPrice: basePrice! + margin!,
        maxQty,
        poStatus,
      },
      existing: prior
        ? { name: prior.name, basePrice: prior.basePrice, margin: prior.margin }
        : null,
    };
  }

  /**
   * Parses the FIRST price in a cell and ignores the rest.
   *
   * Wholesale listings often carry tiers in one string —
   * 'Rp 62.500 /dus  Rp 5.200 /pcs'. Stripping every non-digit would splice
   * those into 625005200, which is silently wrong and can overflow
   * DECIMAL(12,2). Taking the first number keeps the value honest and lets
   * the range check above catch anything still absurd.
   *
   *   '12.500'                 -> 12500
   *   'Rp 12500'               -> 12500
   *   '12,500'                 -> 12500
   *   'Rp 62.500 /dus Rp 5.200'-> 62500
   *   'gratis'                 -> null
   */
  private toNumber(value?: string): number | null {
    if (value === undefined || value === null) return null;

    const text = String(value).trim();
    if (!text) return null;

    // First run of digits, optionally grouped by '.' or ',' as thousands.
    const match = text.match(/-?\d{1,3}(?:[.,]\d{3})*(?:\d*)?|-?\d+/);
    if (!match) return null;

    // Drop grouping separators; a trailing ',00' / '.00' decimal is discarded
    // deliberately — IDR has no cents in this catalog.
    const digits = match[0].replace(/[.,]/g, '');
    const n = Number(digits);
    return Number.isFinite(n) ? n : null;
  }
}
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import slugify from 'slugify';

import { Product } from './entities/product.entity';
import {
  PoStatus,
  ProductBatchPrice,
} from './entities/product-batch-price.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CatalogSection, QueryCatalogDto } from './dto/query-catalog.dto';
import {
  AdminCatalogItem,
  CatalogItem,
  Paginated,
} from './interfaces/catalog-item.interface';
import { BatchesService } from '../batches/batches.service';
import { SettingsService } from '../settings/settings.service';
import { suggestPricing } from './pricing-policy';

const SECTION_CATEGORIES: Partial<Record<CatalogSection, string[]>> = {
  dapur: [
    'Beras',
    'Gula',
    'Keju',
    'Margarin',
    'Minyak Goreng',
    'Tepung',
    'Kebutuhan Dapur',
    'Sembako',
    'Protein',
    'Makanan Instan',
  ],
  'sayur-buah': [
    'Sayur',
    'Sayuran',
    'Buah',
    'Cabai',
    'Cabe',
    'Bawang',
    'Sayur & Buah',
    'Produk Segar',
  ],
  'rumah-tangga': [
    'Rumah Tangga',
    'Kebersihan',
    'Peralatan Dapur',
    'Peralatan Rumah Tangga',
    'Cosmetic',
  ],
};

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductBatchPrice)
    private readonly priceRepo: Repository<ProductBatchPrice>,
    private readonly batchesService: BatchesService,
    private readonly settingsService: SettingsService,
    private readonly dataSource: DataSource,
  ) { }

  // ---------- Storefront ----------

  async findCatalog(query: QueryCatalogDto): Promise<Paginated<CatalogItem>> {
    if (query.section === 'umkm') {
      return this.findMerchantCatalog(query);
    }

    const batchId =
      query.batchId ?? Number(await this.batchesService.resolveOpenBatchId());

    const qb = this.buildCatalogQuery(batchId, query).andWhere(
      'pbp.po_status != :hidden',
      { hidden: PoStatus.HIDDEN },
    );

    const [rows, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const storefront = await this.settingsService.getStorefrontSettings();
    return this.paginate(
      rows.map((r) => this.toCatalogItem(r, storefront)),
      query,
      total,
    );
  }

  async findCategories(
    batchId?: number,
    section?: CatalogSection,
  ): Promise<Array<{ name: string; count: number }>> {
    if (section === 'umkm') {
      const rows = await this.productRepo
        .createQueryBuilder('p')
        .select('p.category', 'name')
        .addSelect('COUNT(*)', 'count')
        .where('p.is_active = 1')
        .andWhere('p.merchant_id IS NOT NULL')
        .andWhere('p.merchant_status = :approved', { approved: 'approved' })
        .andWhere('p.category IS NOT NULL')
        .andWhere("TRIM(p.category) != ''")
        .groupBy('p.category')
        .orderBy('p.category', 'ASC')
        .getRawMany<{ name: string; count: string }>();

      return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
    }

    const resolved =
      batchId ?? Number(await this.batchesService.resolveOpenBatchId());

    const qb = this.priceRepo
      .createQueryBuilder('pbp')
      .innerJoin('pbp.product', 'p')
      .select('p.category', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('pbp.batch_id = :resolved', { resolved })
      .andWhere('p.is_active = 1')
      .andWhere('pbp.po_status != :hidden', { hidden: PoStatus.HIDDEN })
      .andWhere('p.category IS NOT NULL')
      .andWhere("TRIM(p.category) != ''");

    this.applySectionFilter(qb, section);

    const rows = await qb
      .groupBy('p.category')
      .orderBy('p.category', 'ASC')
      .getRawMany<{ name: string; count: string }>();

    return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
  }

  async findOneBySlug(slug: string, batchId?: number): Promise<CatalogItem> {
    const merchantProduct = await this.productRepo.findOne({
      where: {
        slug,
        isActive: true,
        merchantStatus: 'approved' as any,
      },
      relations: { merchant: true },
    });

    if (merchantProduct?.merchantId) {
      return this.toMerchantCatalogItem(merchantProduct);
    }

    const resolved = batchId ?? Number(await this.batchesService.resolveOpenBatchId());

    const row = await this.priceRepo
      .createQueryBuilder('pbp')
      .innerJoinAndSelect('pbp.product', 'p')
      .leftJoinAndSelect('p.merchant', 'merchant')
      .where('pbp.batch_id = :resolved', { resolved })
      .andWhere('p.slug = :slug', { slug })
      .andWhere('p.is_active = 1')
      .andWhere('pbp.po_status != :hidden', { hidden: PoStatus.HIDDEN })
      .getOne();

    if (!row) throw new NotFoundException(`Product "${slug}" not in this PO batch`);
    const storefront = await this.settingsService.getStorefrontSettings();
    return this.toCatalogItem(row, storefront);
  }

  // ---------- Admin ----------

  async findAdminCatalog(
    query: QueryCatalogDto,
  ): Promise<Paginated<AdminCatalogItem>> {
    const batchId =
      query.batchId ?? Number(await this.batchesService.resolveOpenBatchId());

    const [rows, total] = await this.buildCatalogQuery(batchId, query)
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const storefront = await this.settingsService.getStorefrontSettings();
    return this.paginate(
      rows.map((r) => {
        const suggestion = suggestPricing(r.basePrice, r.marketReferencePrice);
        return {
          ...this.toCatalogItem(r, storefront),
          basePrice: r.basePrice,
          margin: r.margin,
          marketReferencePrice: r.marketReferencePrice,
          suggestedMargin: suggestion.margin,
          suggestedPrice: suggestion.sellingPrice,
          pricingReason: suggestion.reason,
        };
      }),
      query,
      total,
    );
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const slug = dto.slug ?? slugify(dto.name, { lower: true, strict: true });

    const clash = await this.productRepo.findOne({
      where: [{ sku: dto.sku }, { slug }],
      withDeleted: true,
    });
    if (clash) throw new ConflictException('SKU or slug already exists');

    return this.productRepo.save(
      this.productRepo.create({ ...dto, slug, supplierId: dto.supplierId?.toString() }),
    );
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    Object.assign(product, dto);
    return this.productRepo.save(product);
  }

  async softRemove(id: string): Promise<void> {
    const res = await this.productRepo.softDelete(id);
    if (!res.affected) throw new NotFoundException(`Product ${id} not found`);
  }

  /**
   * Publish / re-price products for a weekly batch.
   * Single upsert — safe to re-run when supplier promos change mid-week.
   */
  async upsertBatchPrices(
    batchId: number,
    items: Array<{
      productId: string;
      basePrice: number;
      margin: number;
      marketReferencePrice?: number | null;
      maxQty?: number | null;
      poStatus?: PoStatus;
      sortOrder?: number;
    }>,
  ): Promise<number> {
    if (!items.length) return 0;

    const result = await this.priceRepo.upsert(
      items.map((i) => ({
        batchId: String(batchId),
        productId: i.productId,
        basePrice: i.basePrice,
        margin: i.margin,
        marketReferencePrice: i.marketReferencePrice ?? null,
        maxQty: i.maxQty ?? null,
        poStatus: i.poStatus ?? PoStatus.AVAILABLE,
        sortOrder: i.sortOrder ?? 0,
      })),
      {
        conflictPaths: ['batchId', 'productId'],
        skipUpdateIfNoValuesChanged: true,
      },
    );

    this.logger.log(`Batch ${batchId}: upserted ${items.length} price rows`);
    return result.identifiers.length;
  }

  // ---------- internals ----------

  private async findMerchantCatalog(
    query: QueryCatalogDto,
  ): Promise<Paginated<CatalogItem>> {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.merchant', 'merchant')
      .where('p.is_active = 1')
      .andWhere('p.merchant_id IS NOT NULL')
      .andWhere('p.merchant_status = :approved', { approved: 'approved' })
      .orderBy('p.created_at', 'DESC');

    if (query.category) qb.andWhere('p.category = :cat', { cat: query.category });

    const keyword = query.q?.trim();
    if (keyword) {
      qb.andWhere(
        `(
          p.name LIKE :keyword
          OR COALESCE(p.description, '') LIKE :keyword
          OR p.sku LIKE :keyword
        )`,
        { keyword: `%${keyword}%` },
      );
    }

    if (query.status === 'sold_out') {
      qb.andWhere('1 = 0');
    }

    const [rows, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return this.paginate(
      rows.map((p) => this.toMerchantCatalogItem(p)),
      query,
      total,
    );
  }

  private toMerchantCatalogItem(p: Product): CatalogItem {
    const merchant = p.merchant;
    const shippingLabel = merchant?.freeDeliveryEnabled
      ? `Gratis ongkir hingga ${Number(merchant.freeDeliveryRadiusKm ?? 0)} km`
      : merchant?.deliveryMethod === 'third_party'
        ? 'Ongkir mengikuti provider pengiriman'
        : 'Ongkir mengikuti aturan mitra';

    const preorderDays = Number(p.merchantPreorderDays ?? 2);

    return {
      productId: p.id,
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      category: p.category,
      unit: p.unit,
      imageUrl: p.imageUrl,
      price: Number(p.sellingPrice),
      maxQty: null,
      poStatus: PoStatus.AVAILABLE,
      preorderDays,
      fulfillment: {
        sourceType: 'merchant',
        sourceLabel: merchant?.businessName ?? 'Mitra UMKM',
        shippingLabel,
        deliveryNote: `Pre-order diproses sekitar ${preorderDays} hari setelah pembayaran terverifikasi.`,
      },
    };
  }

  private buildCatalogQuery(batchId: number, query: QueryCatalogDto) {
    const qb = this.priceRepo
      .createQueryBuilder('pbp')
      .innerJoinAndSelect('pbp.product', 'p')
      .leftJoinAndSelect('p.merchant', 'merchant')
      .where('pbp.batch_id = :batchId', { batchId })
      .andWhere('p.is_active = 1')
      // Prefer the current supplier-synced product when a legacy/manual row
      // represents the same item. This removes duplicate storefront cards
      // such as "TROPICAL ... 1000mL" vs "Tropical ... 1000 ml" while keeping
      // the supplier record as the source of truth.
      .andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM product_batch_prices pbp2
          INNER JOIN products p2 ON p2.id = pbp2.product_id
          WHERE pbp2.batch_id = pbp.batch_id
            AND p2.id <> p.id
            AND p2.is_active = 1
            AND pbp2.po_status <> :dedupeHidden
            AND p2.supplier_external_id IS NOT NULL
            AND p.supplier_external_id IS NULL
            AND REGEXP_REPLACE(LOWER(p2.name), '[^a-z0-9]', '') =
                REGEXP_REPLACE(LOWER(p.name), '[^a-z0-9]', '')
        )`,
        { dedupeHidden: PoStatus.HIDDEN },
      )
      .orderBy('pbp.sort_order', 'ASC')
      .addOrderBy('p.name', 'ASC');

    if (query.category) qb.andWhere('p.category = :cat', { cat: query.category });
    this.applySectionFilter(qb, query.section);
    if (query.status) qb.andWhere('pbp.po_status = :st', { st: query.status });

    const keyword = query.q?.trim();
    if (keyword) {
      qb.andWhere(
        `(
      p.name LIKE :keyword
      OR COALESCE(p.description, '') LIKE :keyword
      OR p.sku LIKE :keyword
    )`,
        { keyword: `%${keyword}%` },
      );
    }
    return qb;
  }

  private applySectionFilter(
    qb: SelectQueryBuilder<ProductBatchPrice>,
    section?: CatalogSection,
  ) {
    if (!section) return;

    if (section === 'umkm') {
      qb.andWhere('p.merchant_id IS NOT NULL');
      return;
    }

    // "Paketan" is a bundle-only storefront section. Product queries must
    // never fall back to the full loose-product catalog.
    if (section === 'paketan') {
      qb.andWhere('1 = 0');
      return;
    }

    qb.andWhere('p.merchant_id IS NULL');
    const categories = SECTION_CATEGORIES[section];
    if (categories?.length) {
      qb.andWhere('p.category IN (:...sectionCategories)', {
        sectionCategories: categories,
      });
    }
  }

  pricingSuggestion(basePrice: number, marketReferencePrice?: number | null) {
    return suggestPricing(basePrice, marketReferencePrice);
  }

  async applyPricingPolicy(batchId?: number) {
    const resolved =
      batchId ?? Number(await this.batchesService.resolveOpenBatchId());

    const rows = await this.priceRepo.find({
      where: { batchId: String(resolved) },
    });

    let changed = 0;
    for (const row of rows) {
      const suggestion = suggestPricing(row.basePrice, row.marketReferencePrice);
      if (Number(row.margin) !== Number(suggestion.margin)) {
        row.margin = suggestion.margin;
        changed += 1;
      }
    }

    if (changed > 0) {
      await this.priceRepo.save(rows, { chunk: 500 });
    }

    this.logger.log(
      `Batch ${resolved}: pricing policy applied to ${changed}/${rows.length} rows`,
    );

    return { batchId: String(resolved), total: rows.length, changed };
  }

  private toCatalogItem(
    row: ProductBatchPrice,
    storefront: {
      storefrontShipFromLabel: string;
      storefrontFreeDeliveryText: string;
      storefrontDeliveryNote: string;
    },
  ): CatalogItem {
    const p = row.product!;
    const merchant = p.merchant;

    const merchantShippingLabel = merchant
      ? merchant.freeDeliveryEnabled
        ? `Gratis ongkir hingga ${Number(merchant.freeDeliveryRadiusKm ?? 0)} km`
        : merchant.deliveryMethod === 'third_party'
          ? 'Ongkir mengikuti provider pengiriman'
          : 'Ongkir mengikuti aturan mitra'
      : storefront.storefrontFreeDeliveryText;

    const merchantDeliveryNote = merchant
      ? [
          merchant.deliveryMethod === 'third_party'
            ? 'Dikirim oleh partner logistik mitra.'
            : merchant.deliveryMethod === 'both'
              ? 'Bisa dikirim kurir mitra atau partner logistik.'
              : 'Dikirim oleh kurir mitra.',
          merchant.maxDeliveryRadiusKm
            ? `Maks. jangkauan ${Number(merchant.maxDeliveryRadiusKm)} km.`
            : null,
        ]
          .filter(Boolean)
          .join(' ')
      : storefront.storefrontDeliveryNote;

    return {
      productId: p.id,
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      category: p.category,
      unit: p.unit,
      imageUrl: p.imageUrl,
      price: row.sellingPrice,
      maxQty: row.maxQty,
      poStatus: row.poStatus,
      preorderDays: null,
      fulfillment: {
        sourceType: merchant ? 'merchant' : 'wpo',
        sourceLabel: merchant?.businessName ?? storefront.storefrontShipFromLabel,
        shippingLabel: merchantShippingLabel,
        deliveryNote: merchantDeliveryNote,
      },
    };
  }

  private paginate<T>(
    data: T[],
    query: QueryCatalogDto,
    total: number,
  ): Paginated<T> {
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

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
  // KlikIndogrosir publishes this as a recommendation collection rather than
  // a taxonomy. We surface it as the storefront "Paketan" menu.
  paketan: ['Rekomendasi Warung Sembako'],
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
    private readonly dataSource: DataSource,
  ) { }

  // ---------- Storefront ----------

  async findCatalog(query: QueryCatalogDto): Promise<Paginated<CatalogItem>> {
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

    return this.paginate(rows.map((r) => this.toCatalogItem(r)), query, total);
  }

  async findCategories(
    batchId?: number,
    section?: CatalogSection,
  ): Promise<Array<{ name: string; count: number }>> {
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
    const resolved = batchId ?? Number(await this.batchesService.resolveOpenBatchId());

    const row = await this.priceRepo
      .createQueryBuilder('pbp')
      .innerJoinAndSelect('pbp.product', 'p')
      .where('pbp.batch_id = :resolved', { resolved })
      .andWhere('p.slug = :slug', { slug })
      .andWhere('p.is_active = 1')
      .andWhere('pbp.po_status != :hidden', { hidden: PoStatus.HIDDEN })
      .getOne();

    if (!row) throw new NotFoundException(`Product "${slug}" not in this PO batch`);
    return this.toCatalogItem(row);
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

    return this.paginate(
      rows.map((r) => ({
        ...this.toCatalogItem(r),
        basePrice: r.basePrice,
        margin: r.margin,
      })),
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

  private buildCatalogQuery(batchId: number, query: QueryCatalogDto) {
    const qb = this.priceRepo
      .createQueryBuilder('pbp')
      .innerJoinAndSelect('pbp.product', 'p')
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

    qb.andWhere('p.merchant_id IS NULL');
    const categories = SECTION_CATEGORIES[section];
    if (categories?.length) {
      qb.andWhere('p.category IN (:...sectionCategories)', {
        sectionCategories: categories,
      });
    }
  }

  private toCatalogItem(row: ProductBatchPrice): CatalogItem {
    const p = row.product!;
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

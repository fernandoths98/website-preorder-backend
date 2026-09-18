import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import slugify from 'slugify';
import { Supplier } from './entities/supplier.entity';
import { SupplierSyncRun, SupplierSyncStatus } from './entities/supplier-sync-run.entity';
import { SupplierSyncDto } from './dto/supplier-sync.dto';
import { Product } from '../products/entities/product.entity';
import { PoStatus, ProductBatchPrice } from '../products/entities/product-batch-price.entity';
import { BatchesService } from '../batches/batches.service';

@Injectable()
export class SupplierSyncService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectRepository(SupplierSyncRun)
    private readonly runs: Repository<SupplierSyncRun>,
    private readonly dataSource: DataSource,
    private readonly batches: BatchesService,
  ) {}

  async preview(dto: SupplierSyncDto) {
    const supplier = await this.suppliers.findOneBy({ id: String(dto.supplierId) });
    if (!supplier) throw new NotFoundException('Supplier tidak ditemukan');

    const existing = await this.dataSource.getRepository(Product).find({
      where: { supplierId: supplier.id },
    });
    const byExternalId = new Map(
      existing
        .filter((product) => product.supplierExternalId)
        .map((product) => [product.supplierExternalId as string, product]),
    );

    let wouldCreate = 0;
    let wouldUpdate = 0;
    let unchanged = 0;
    const seen = new Set<string>();
    const duplicateExternalIds: string[] = [];

    for (const row of dto.products) {
      if (seen.has(row.externalId)) duplicateExternalIds.push(row.externalId);
      seen.add(row.externalId);

      const product = byExternalId.get(row.externalId);
      if (!product) {
        wouldCreate += 1;
        continue;
      }

      const available = row.available !== false;
      const margin = row.margin ?? 2000;
      const sku = row.sku.trim().toUpperCase();
      const category = row.category || null;
      const unit = row.unit || 'pcs';
      const imageChanged = Boolean(row.imageUrl) && row.imageUrl !== product.imageUrl;

      const changed =
        product.sku !== sku ||
        product.name !== row.name ||
        product.category !== category ||
        product.unit !== unit ||
        imageChanged ||
        Number(product.basePrice) !== Number(row.basePrice) ||
        Number(product.margin) !== Number(margin) ||
        product.supplierAvailable !== available;

      if (changed) wouldUpdate += 1;
      else unchanged += 1;
    }

    const wouldMarkUnavailable = existing.filter(
      (product) =>
        product.supplierAvailable &&
        Boolean(product.supplierExternalId) &&
        !seen.has(product.supplierExternalId as string),
    ).length;

    return {
      dryRun: true,
      supplier: { id: supplier.id, name: supplier.name },
      snapshotComplete: true,
      received: dto.products.length,
      existing: existing.length,
      wouldCreate,
      wouldUpdate,
      unchanged,
      wouldMarkUnavailable,
      duplicateExternalIds: [...new Set(duplicateExternalIds)],
      safeToReconcile: duplicateExternalIds.length === 0,
    };
  }

  async reconcile(dto: SupplierSyncDto) {
    const supplier = await this.suppliers.findOneBy({ id: String(dto.supplierId) });
    if (!supplier) throw new NotFoundException('Supplier tidak ditemukan');

    const run = await this.runs.save(
      this.runs.create({
        supplierId: supplier.id,
        source: dto.source || 'n8n',
        productsReceived: dto.products.length,
      }),
    );

    try {
      const batch = await this.batches.current();
      const now = new Date();
      let created = 0;
      let updated = 0;
      let unavailable = 0;

      await this.dataSource.transaction(async (manager) => {
        const products = manager.getRepository(Product);
        const prices = manager.getRepository(ProductBatchPrice);
        const seen: string[] = [];

        for (const row of dto.products) {
          seen.push(row.externalId);
          const available = row.available !== false;
          const margin = row.margin ?? 2000;

          let product = await products.findOne({
            where: {
              supplierId: supplier.id,
              supplierExternalId: row.externalId,
            },
          });

          if (!product) {
            let slug = slugify(row.name, { lower: true, strict: true });
            const collision = await products.findOneBy({ slug });
            if (collision) {
              slug = `${slug}-${slugify(row.sku, { lower: true, strict: true })}`;
            }

            const entity = products.create({
              supplierId: supplier.id,
              supplierExternalId: row.externalId,
              sku: row.sku.trim().toUpperCase(),
              slug,
              name: row.name,
              category: row.category || null,
              unit: row.unit || 'pcs',
              imageUrl: row.imageUrl || null,
              basePrice: row.basePrice,
              margin,
              isActive: true,
              supplierAvailable: available,
              supplierLastSeenAt: now,
              supplierLastSyncedAt: now,
            });

            product = await products.save(entity);
            created += 1;
          } else {
            product.sku = row.sku.trim().toUpperCase();
            product.name = row.name;
            product.category = row.category || null;
            product.unit = row.unit || 'pcs';
            if (row.imageUrl) product.imageUrl = row.imageUrl;
            product.basePrice = row.basePrice;
            product.margin = margin;
            product.supplierAvailable = available;
            product.supplierLastSeenAt = now;
            product.supplierLastSyncedAt = now;
            product = await products.save(product);
            updated += 1;
          }

          await prices.upsert(
            {
              batchId: batch.id,
              productId: product.id,
              basePrice: row.basePrice,
              margin,
              maxQty: row.maxQty ?? null,
              poStatus: available ? PoStatus.AVAILABLE : PoStatus.SOLD_OUT,
            },
            { conflictPaths: ['batchId', 'productId'] },
          );
        }

        const availabilityUpdate = products
          .createQueryBuilder()
          .update(Product)
          .set({
            supplierAvailable: false,
            supplierLastSyncedAt: now,
          })
          .where('supplier_id = :supplierId', { supplierId: supplier.id });

        if (seen.length > 0) {
          availabilityUpdate.andWhere(
            'supplier_external_id NOT IN (:...seen)',
            { seen },
          );
        }

        const result = await availabilityUpdate.execute();
        unavailable = result.affected || 0;

        await prices
          .createQueryBuilder()
          .update(ProductBatchPrice)
          .set({ poStatus: PoStatus.SOLD_OUT })
          .where('batch_id = :batchId', { batchId: batch.id })
          .andWhere(
            'product_id IN (SELECT id FROM products WHERE supplier_id = :supplierId AND supplier_available = 0)',
            { supplierId: supplier.id },
          )
          .execute();
      });

      run.status = SupplierSyncStatus.SUCCESS;
      run.productsCreated = created;
      run.productsUpdated = updated;
      run.productsUnavailable = unavailable;
      run.finishedAt = new Date();
      await this.runs.save(run);

      return {
        runId: run.id,
        status: run.status,
        received: dto.products.length,
        created,
        updated,
        unavailable,
      };
    } catch (error) {
      run.status = SupplierSyncStatus.FAILED;
      run.errorMessage = error instanceof Error ? error.message : String(error);
      run.finishedAt = new Date();
      await this.runs.save(run);
      throw error;
    }
  }

  latest(limit = 20) {
    return this.runs.find({
      relations: { supplier: true },
      order: { startedAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }
}

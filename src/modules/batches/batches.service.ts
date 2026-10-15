import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

import { BatchStatus, PoBatch } from './entities/po-batch.entity';

const TZ = 'Asia/Jakarta';

@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name);

  constructor(
    @InjectRepository(PoBatch)
    private readonly batchRepo: Repository<PoBatch>,
  ) {}

  /**
   * The batch the storefront is currently reading. Falls back to the most
   * recent batch so the catalog is browsable (read-only) outside Mon–Wed.
   */
  async current(): Promise<PoBatch> {
    const now = new Date();

    const open = await this.batchRepo.findOne({
      where: {
        status: BatchStatus.OPEN,
        opensAt: LessThanOrEqual(now),
        closesAt: MoreThanOrEqual(now),
      },
    });
    if (open) {
      await this.ensureCatalog(open);
      return open;
    }

    const latest = await this.batchRepo.findOne({
      where: {},
      order: { opensAt: 'DESC' },
    });
    if (!latest) throw new NotFoundException('Belum ada batch PO');
    await this.ensureCatalog(latest);
    return latest;
  }


  /**
   * A weekly rollover must not empty the daily storefront catalog.
   * Seed only a completely empty batch; never overwrite an admin's prices,
   * availability, or deliberately hidden catalog.
   */
  private async ensureCatalog(batch: PoBatch): Promise<void> {
    if (batch.status === BatchStatus.CANCELLED || batch.status === BatchStatus.DRAFT) return;
    const existing = await this.batchRepo.query(
      'SELECT id FROM product_batch_prices WHERE batch_id = ? LIMIT 1',
      [batch.id],
    );
    if (existing.length) return;

    await this.batchRepo.manager.transaction(async (em) => {
      // Serialize concurrent storefront requests/cron workers for this batch.
      const locked = await em.query(
        'SELECT id, status FROM po_batches WHERE id = ? FOR UPDATE',
        [batch.id],
      );
      if (!locked.length || [BatchStatus.CANCELLED, BatchStatus.DRAFT].includes(locked[0].status)) return;
      const populated = await em.query(
        'SELECT id FROM product_batch_prices WHERE batch_id = ? LIMIT 1',
        [batch.id],
      );
      if (populated.length) return;

      const sources = await em.query(
        `SELECT b.id FROM po_batches b
         WHERE b.id <> ? AND b.opens_at <= ?
           AND b.status NOT IN ('cancelled', 'draft')
           AND EXISTS (
             SELECT 1 FROM product_batch_prices prices WHERE prices.batch_id = b.id
           )
         ORDER BY b.opens_at DESC, b.id DESC LIMIT 1`,
        [batch.id, batch.opensAt],
      );
      if (!sources.length) return;

      const result = await em.query(
        `INSERT INTO product_batch_prices
           (batch_id, product_id, base_price, margin, market_reference_price,
            max_qty, po_status, sort_order)
         SELECT ?, old.product_id, old.base_price, old.margin,
                old.market_reference_price, old.max_qty,
                CASE
                  WHEN old.po_status = 'hidden' THEN 'hidden'
                  WHEN p.supplier_available = 0 THEN 'sold_out'
                  ELSE old.po_status
                END,
                old.sort_order
         FROM product_batch_prices old
         INNER JOIN products p ON p.id = old.product_id
         WHERE old.batch_id = ?
           AND p.deleted_at IS NULL AND p.is_active = 1
           AND (p.merchant_id IS NULL OR p.merchant_status = 'approved')
         ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)`,
        [batch.id, sources[0].id],
      );
      this.logger.log(
        `Batch ${batch.code}: carried forward ${result.affectedRows ?? 0} catalog rows from batch ${sources[0].id}`,
      );
    });
  }

  /** Used by services that only need the FK. */
  async resolveOpenBatchId(): Promise<string> {
    return (await this.current()).id;
  }

  async findOne(id: string): Promise<PoBatch> {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) throw new NotFoundException(`Batch ${id} not found`);
    return batch;
  }

  /** ISO week code, e.g. PO-2026-W38. */
  static weekCode(d: Date): string {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `PO-${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  /** Monday 00:05 WIB — open this week's batch, creating it if the admin didn't. */
  @Cron('5 0 * * 1', { timeZone: TZ })
  async openWeekly(): Promise<void> {
    const code = BatchesService.weekCode(new Date());
    let batch = await this.batchRepo.findOne({ where: { code } });

    if (!batch) {
      const opensAt = new Date();
      const closesAt = new Date(opensAt);
      closesAt.setDate(closesAt.getDate() + 2);
      closesAt.setHours(23, 59, 59, 0);

      const deliveryDate = new Date(opensAt);
      deliveryDate.setDate(deliveryDate.getDate() + 5); // Saturday

      batch = this.batchRepo.create({
        code,
        opensAt,
        closesAt,
        deliveryDate: deliveryDate.toISOString().slice(0, 10),
        status: BatchStatus.DRAFT,
      });
    }

    batch.status = BatchStatus.OPEN;
    batch = await this.batchRepo.save(batch);
    await this.ensureCatalog(batch);
    this.logger.log(`Batch ${code} opened`);
  }

  /** Wednesday 23:59 WIB — close ordering; sourcing starts Thursday. */
  @Cron('59 23 * * 3', { timeZone: TZ })
  async closeWeekly(): Promise<void> {
    const res = await this.batchRepo
      .createQueryBuilder()
      .update(PoBatch)
      .set({ status: BatchStatus.CLOSED })
      .where('status = :open', { open: BatchStatus.OPEN })
      .andWhere('closes_at <= NOW()')
      .execute();

    this.logger.log(`Closed ${res.affected ?? 0} batch(es)`);
  }
}

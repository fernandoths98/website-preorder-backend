import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, MoreThanOrEqual, In, Not, Repository } from 'typeorm';

import { BatchStatus, PoBatch } from './entities/po-batch.entity';
import { defaultDeliverySchedule, jakartaDate, nextDeliverySchedule } from './delivery-schedule';

const TZ = 'Asia/Jakarta';

@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name);

  constructor(
    @InjectRepository(PoBatch)
    private readonly batchRepo: Repository<PoBatch>,
  ) {}

  /** Orders are accepted every day; the internal batch only groups delivery. */
  async current(): Promise<PoBatch> {
    const now = new Date();
    const open = await this.batchRepo.findOne({
      where: {
        status: BatchStatus.OPEN,
        closesAt: MoreThan(now),
        deliveryDate: MoreThanOrEqual(jakartaDate(now)),
      },
      order: { deliveryDate: 'ASC', closesAt: 'ASC' },
    });
    if (open) {
      await this.ensureCatalog(open);
      return open;
    }

    const latest = await this.batchRepo.findOne({
      where: { status: Not(In([BatchStatus.DRAFT, BatchStatus.CANCELLED])) },
      order: { closesAt: 'DESC' },
    });
    let schedule = latest?.deliveryDate
      ? nextDeliverySchedule({ opensAt: latest.opensAt, closesAt: latest.closesAt, deliveryDate: latest.deliveryDate }, now)
      : defaultDeliverySchedule(now);

    for (let attempt = 0; attempt < 104; attempt++) {
      const code = BatchesService.weekCode(new Date(schedule.opensAt.getTime() + 7 * 3600_000));
      let batch = await this.batchRepo.findOne({ where: { code } });
      if (!batch) {
        try {
          batch = await this.batchRepo.save(this.batchRepo.create({ ...schedule, code, status: BatchStatus.OPEN }));
        } catch (error: any) {
          // Two requests can create the same delivery schedule concurrently.
          if ((error?.driverError?.code ?? error?.code) !== 'ER_DUP_ENTRY') throw error;
          batch = await this.batchRepo.findOne({ where: { code } });
          if (!batch) throw error;
        }
      }
      if (batch.status === BatchStatus.OPEN && new Date(batch.closesAt) > now && batch.deliveryDate && batch.deliveryDate >= jakartaDate(now)) {
        await this.ensureCatalog(batch);
        return batch;
      }
      // Never reopen historical, cancelled, or explicitly draft schedules.
      schedule = nextDeliverySchedule(schedule, new Date(Math.max(now.getTime(), schedule.closesAt.getTime() + 1)));
    }
    throw new ServiceUnavailableException('Jadwal pengiriman belum tersedia. Silakan hubungi admin.');
  }

  async forCheckout(expectedDeliveryDate?: string, legacyBatchId?: string): Promise<PoBatch> {
    const batch = await this.current();
    if ((expectedDeliveryDate && expectedDeliveryDate !== batch.deliveryDate) ||
        (!expectedDeliveryDate && legacyBatchId && legacyBatchId !== batch.id)) {
      throw new ConflictException('Jadwal pengiriman diperbarui. Muat ulang checkout dan periksa tanggal pengiriman sebelum membayar.');
    }
    return batch;
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
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `PO-${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  /** Keep the next delivery ready; storefront requests also resolve it on demand. */
  @Cron('5 0 * * 1', { timeZone: TZ })
  async openWeekly(): Promise<void> {
    const batch = await this.current();
    this.logger.log(`Delivery schedule ${batch.code} ready`);
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

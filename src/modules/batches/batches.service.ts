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
    if (open) return open;

    const latest = await this.batchRepo.findOne({
      where: {},
      order: { opensAt: 'DESC' },
    });
    if (!latest) throw new NotFoundException('Belum ada batch PO');
    return latest;
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
    await this.batchRepo.save(batch);
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Order, OrderStatus } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { PoBatch } from '../batches/entities/po-batch.entity';
import { BatchesService } from '../batches/batches.service';
import type {
  BatchSummary,
  SourcingRow,
  SourcingSheet,
} from './interfaces/report.interface';

/** Orders that represent real demand — cancelled never counts. */
const LIVE_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.SOURCED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(PoBatch)
    private readonly batchRepo: Repository<PoBatch>,
    private readonly batchesService: BatchesService,
  ) {}

  /**
   * The Thursday/Friday shopping list: one row per SKU, aggregated across
   * every live order in the batch. Aggregation happens in MySQL over the
   * generated line_* columns — never in JS over a hydrated order graph.
   */
  async sourcingSheet(batchId?: number): Promise<SourcingSheet> {
    const batch = await this.resolveBatch(batchId);

    const rows = await this.itemRepo
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .select('oi.product_id', 'productId')
      .addSelect('oi.product_name', 'productName')
      .addSelect('oi.unit', 'unit')
      .addSelect('oi.base_price', 'basePrice')
      .addSelect('SUM(oi.qty)', 'totalQty')
      .addSelect('SUM(oi.line_base)', 'totalModal')
      .addSelect('SUM(oi.line_margin)', 'totalMargin')
      .addSelect('SUM(oi.line_total)', 'totalRevenue')
      .where('o.batch_id = :batchId', { batchId: batch.id })
      .andWhere('o.status IN (:...statuses)', { statuses: LIVE_STATUSES })
      .groupBy('oi.product_id')
      .addGroupBy('oi.product_name')
      .addGroupBy('oi.unit')
      .addGroupBy('oi.base_price')
      .orderBy('totalQty', 'DESC')
      .getRawMany<Record<keyof SourcingRow, string>>();

    const parsed: SourcingRow[] = rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      unit: r.unit,
      totalQty: Number(r.totalQty),
      basePrice: Number(r.basePrice),
      totalModal: Number(r.totalModal),
      totalMargin: Number(r.totalMargin),
      totalRevenue: Number(r.totalRevenue),
    }));

    return {
      batchId: batch.id,
      batchCode: batch.code,
      rows: parsed,
      totals: {
        modal: parsed.reduce((n, r) => n + r.totalModal, 0),
        margin: parsed.reduce((n, r) => n + r.totalMargin, 0),
        revenue: parsed.reduce((n, r) => n + r.totalRevenue, 0),
        skuCount: parsed.length,
      },
    };
  }

  /** Headline magnitudes for the dashboard tiles. Two queries, no N+1. */
  async batchSummary(batchId?: number): Promise<BatchSummary> {
    const batch = await this.resolveBatch(batchId);

    const totals = await this.orderRepo
      .createQueryBuilder('o')
      .select('COUNT(*)', 'ordersTotal')
      .addSelect('COUNT(DISTINCT o.customer_id)', 'customersTotal')
      .addSelect('COALESCE(SUM(o.items_count), 0)', 'itemsTotal')
      .addSelect('COALESCE(SUM(o.grand_total), 0)', 'revenue')
      .addSelect('COALESCE(SUM(o.subtotal_base), 0)', 'modal')
      .addSelect('COALESCE(SUM(o.subtotal_margin), 0)', 'margin')
      .where('o.batch_id = :batchId', { batchId: batch.id })
      .andWhere('o.status IN (:...statuses)', { statuses: LIVE_STATUSES })
      .getRawOne<Record<string, string>>();

    const byStatus = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('o.batch_id = :batchId', { batchId: batch.id })
      .groupBy('o.status')
      .getRawMany<{ status: OrderStatus; count: string }>();

    const ordersByStatus = Object.values(OrderStatus).reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<OrderStatus, number>,
    );
    byStatus.forEach((r) => (ordersByStatus[r.status] = Number(r.count)));

    const ordersTotal = Number(totals?.ordersTotal ?? 0);
    const revenue = Number(totals?.revenue ?? 0);

    return {
      batchId: batch.id,
      batchCode: batch.code,
      status: batch.status,
      closesAt: batch.closesAt.toISOString(),
      ordersTotal,
      ordersByStatus,
      customersTotal: Number(totals?.customersTotal ?? 0),
      itemsTotal: Number(totals?.itemsTotal ?? 0),
      revenue,
      modal: Number(totals?.modal ?? 0),
      margin: Number(totals?.margin ?? 0),
      avgOrderValue: ordersTotal ? Math.round(revenue / ordersTotal) : 0,
    };
  }

  /** CSV for offline use at the store — no spreadsheet dependency. */
  async sourcingCsv(batchId?: number): Promise<{ filename: string; csv: string }> {
    const sheet = await this.sourcingSheet(batchId);
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

    const lines = [
      ['Produk', 'Qty', 'Satuan', 'Harga Modal', 'Total Modal', 'Margin', 'Total Jual']
        .map(esc)
        .join(','),
      ...sheet.rows.map((r) =>
        [r.productName, r.totalQty, r.unit, r.basePrice, r.totalModal, r.totalMargin, r.totalRevenue]
          .map(esc)
          .join(','),
      ),
      ['TOTAL', '', '', '', sheet.totals.modal, sheet.totals.margin, sheet.totals.revenue]
        .map(esc)
        .join(','),
    ];

    return {
      filename: `sourcing-${sheet.batchCode}.csv`,
      // BOM so Excel on Windows reads UTF-8 correctly.
      csv: '﻿' + lines.join('\r\n'),
    };
  }

  private async resolveBatch(batchId?: number): Promise<PoBatch> {
    const id = batchId ?? Number(await this.batchesService.resolveOpenBatchId());
    const batch = await this.batchRepo.findOne({ where: { id: String(id) } });
    if (!batch) throw new NotFoundException(`Batch ${id} not found`);
    return batch;
  }
}

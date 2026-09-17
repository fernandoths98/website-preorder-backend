import { OrderStatus } from '../../orders/entities/order.entity';

/** One row of the Thursday shopping list. */
export interface SourcingRow {
  productId: string;
  productName: string;
  unit: string;
  totalQty: number;
  basePrice: number;
  totalModal: number;
  totalMargin: number;
  totalRevenue: number;
}

export interface SourcingSheet {
  batchId: string;
  batchCode: string;
  rows: SourcingRow[];
  totals: { modal: number; margin: number; revenue: number; skuCount: number };
}

/** Headline numbers for the dashboard. Magnitudes, not a time series. */
export interface BatchSummary {
  batchId: string;
  batchCode: string;
  status: string;
  closesAt: string;
  ordersTotal: number;
  ordersByStatus: Record<OrderStatus, number>;
  customersTotal: number;
  itemsTotal: number;
  revenue: number;
  modal: number;
  margin: number;
  avgOrderValue: number;
}

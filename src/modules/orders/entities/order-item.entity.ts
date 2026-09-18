import {
  Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../../products/entities/product.entity';
import { Bundle } from '../../bundles/entities/bundle.entity';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

/** Immutable price snapshot. Generated columns are read-only to the ORM. */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId: string;

  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  /**
   * Paket this line came from, NULL when the item was bought loose. The row
   * stays per-product either way, which is why v_sourcing_sheet needed no
   * change: paket contents land on the Thursday shopping list automatically.
   */
  @Column({ name: 'bundle_id', type: 'bigint', unsigned: true, nullable: true })
  bundleId: string | null;

  @ManyToOne(() => Bundle, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bundle_id' })
  bundle?: Bundle;

  /** Snapshot — the paket name as it was sold. */
  @Column({ name: 'bundle_name', type: 'varchar', length: 160, nullable: true })
  bundleName: string | null;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({ name: 'product_name', type: 'varchar', length: 160 })
  productName: string;

  @Column({ type: 'varchar', length: 24 })
  unit: string;

  @Column({ type: 'int', unsigned: true })
  qty: number;

  @Column({ name: 'base_price', type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  basePrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  margin: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2, insert: false, update: false, transformer: decimalTransformer })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 12, scale: 2, insert: false, update: false, transformer: decimalTransformer })
  lineTotal: number;

  @Column({ name: 'line_base', type: 'decimal', precision: 12, scale: 2, insert: false, update: false, transformer: decimalTransformer })
  lineBase: number;

  @Column({ name: 'line_margin', type: 'decimal', precision: 12, scale: 2, insert: false, update: false, transformer: decimalTransformer })
  lineMargin: number;
}

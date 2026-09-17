import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { PoBatch } from '../../batches/entities/po-batch.entity';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum DeliveryType {
  /** Same company — dropped at the customer's desk. */
  OFFICE = 'office',
  /** Outside the office — needs a real address. */
  OUTSIDE = 'outside',
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SOURCED = 'sourced',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

@Entity('orders')
@Index('idx_orders_batch_status', ['batchId', 'status'])
export class Order {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'order_no', type: 'varchar', length: 24, unique: true })
  orderNo: string;

  @Column({ name: 'batch_id', type: 'bigint', unsigned: true })
  batchId: string;

  @ManyToOne(() => PoBatch)
  @JoinColumn({ name: 'batch_id' })
  batch?: PoBatch;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
  customerId: string;

  @ManyToOne(() => Customer, { eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ name: 'items_count', type: 'int', unsigned: true, default: 0 })
  itemsCount: number;

  /** SUM(base_price * qty) — modal keluar saat sourcing. */
  @Column({ name: 'subtotal_base', type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  subtotalBase: number;

  /** SUM(margin * qty) — gross profit. */
  @Column({ name: 'subtotal_margin', type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  subtotalMargin: number;

  @Column({ name: 'grand_total', type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  grandTotal: number;

  @Column({ name: 'customer_note', type: 'varchar', length: 255, nullable: true })
  customerNote: string | null;

  @Column({
    name: 'delivery_type',
    type: 'enum',
    enum: DeliveryType,
    default: DeliveryType.OFFICE,
  })
  deliveryType: DeliveryType;

  /** Address snapshot — null for office drops. Lives on the order, not the
   *  customer: the same person may order to the office one week, home the next. */
  @Column({ name: 'address_line1', type: 'varchar', length: 255, nullable: true })
  addressLine1: string | null;

  @Column({ name: 'address_district', type: 'varchar', length: 120, nullable: true })
  addressDistrict: string | null;

  @Column({ name: 'address_city', type: 'varchar', length: 120, nullable: true })
  addressCity: string | null;

  @Column({ name: 'address_postal', type: 'varchar', length: 10, nullable: true })
  addressPostal: string | null;

  @Column({ name: 'address_landmark', type: 'varchar', length: 160, nullable: true })
  addressLandmark: string | null;

  @OneToMany(() => OrderItem, (i) => i.order, { cascade: ['insert'] })
  items: OrderItem[];

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

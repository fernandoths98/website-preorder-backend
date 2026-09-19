import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { Order } from './order.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

@Entity('payments')
@Index('uq_payments_order', ['orderId'], { unique: true })
@Index('uq_payments_partner_ref', ['partnerReferenceNo'], { unique: true })
export class Payment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId: string;

  @OneToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  @Column({ type: 'varchar', length: 32, default: 'nusapay' })
  provider: string;

  @Column({ name: 'partner_reference_no', type: 'varchar', length: 64 })
  partnerReferenceNo: string;

  @Column({ name: 'provider_reference_no', type: 'varchar', length: 96, nullable: true })
  providerReferenceNo: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount: number;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ name: 'provider_status', type: 'varchar', length: 16, nullable: true })
  providerStatus: string | null;

  @Column({ name: 'last_provider_check_at', type: 'datetime', nullable: true })
  lastProviderCheckAt: Date | null;

  @Column({ name: 'reconciled_at', type: 'datetime', nullable: true })
  reconciledAt: Date | null;

  @Column({ name: 'reconciliation_source', type: 'varchar', length: 32, nullable: true })
  reconciliationSource: string | null;

  @Column({ name: 'qr_content', type: 'text', nullable: true })
  qrContent: string | null;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'raw_callback', type: 'json', nullable: true })
  rawCallback: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

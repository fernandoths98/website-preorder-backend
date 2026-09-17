import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export enum BatchStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  CLOSED = 'closed',
  SOURCING = 'sourcing',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

@Entity('po_batches')
@Index('idx_po_batches_status_window', ['status', 'opensAt', 'closesAt'])
export class PoBatch {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  /** e.g. PO-2026-W38 */
  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ name: 'opens_at', type: 'datetime' })
  opensAt: Date;

  @Column({ name: 'closes_at', type: 'datetime' })
  closesAt: Date;

  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate: string | null;

  @Column({ type: 'enum', enum: BatchStatus, default: BatchStatus.DRAFT })
  status: BatchStatus;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Supplier } from './supplier.entity';

export enum SupplierSyncStatus { STARTED='started', SUCCESS='success', PARTIAL='partial', FAILED='failed' }

@Entity('supplier_sync_runs')
export class SupplierSyncRun {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id: string;
  @Column({ name: 'supplier_id', type: 'bigint', unsigned: true }) supplierId: string;
  @ManyToOne(() => Supplier, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'supplier_id' }) supplier?: Supplier;
  @Column({ type: 'enum', enum: SupplierSyncStatus, default: SupplierSyncStatus.STARTED }) status: SupplierSyncStatus;
  @Column({ type: 'varchar', length: 80, default: 'n8n' }) source: string;
  @Column({ name: 'products_received', type: 'int', unsigned: true, default: 0 }) productsReceived: number;
  @Column({ name: 'products_created', type: 'int', unsigned: true, default: 0 }) productsCreated: number;
  @Column({ name: 'products_updated', type: 'int', unsigned: true, default: 0 }) productsUpdated: number;
  @Column({ name: 'products_unavailable', type: 'int', unsigned: true, default: 0 }) productsUnavailable: number;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage: string | null;
  @Column({ name: 'started_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) startedAt: Date;
  @Column({ name: 'finished_at', type: 'datetime', nullable: true }) finishedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

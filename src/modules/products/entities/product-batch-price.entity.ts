import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';
import { PoBatch } from '../../batches/entities/po-batch.entity';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum PoStatus {
  AVAILABLE = 'available',
  LIMITED = 'limited',
  SOLD_OUT = 'sold_out',
  HIDDEN = 'hidden',
}

@Entity('product_batch_prices')
@Unique('uq_pbp_batch_product', ['batchId', 'productId'])
@Index('idx_pbp_batch_status_sort', ['batchId', 'poStatus', 'sortOrder'])
export class ProductBatchPrice {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'batch_id', type: 'bigint', unsigned: true })
  batchId: string;

  @ManyToOne(() => PoBatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch?: PoBatch;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId: string;

  @ManyToOne(() => Product, (p) => p.batchPrices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({
    name: 'base_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  basePrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  margin: number;

  @Column({
    name: 'market_reference_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  marketReferencePrice: number | null;

  @Column({
    name: 'selling_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    generatedType: 'STORED',
    asExpression: '`base_price` + `margin`',
    insert: false,
    update: false,
    transformer: decimalTransformer,
  })
  sellingPrice: number;

  @Column({ name: 'max_qty', type: 'int', unsigned: true, nullable: true })
  maxQty: number | null;

  @Column({
    name: 'po_status',
    type: 'enum',
    enum: PoStatus,
    default: PoStatus.AVAILABLE,
  })
  poStatus: PoStatus;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

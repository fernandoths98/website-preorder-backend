import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { ProductBatchPrice } from './product-batch-price.entity';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('products')
@Index('idx_products_active_category', ['isActive', 'category'])
export class Product {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'supplier_id', type: 'bigint', unsigned: true, nullable: true })
  supplierId: string | null;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplier_id' })
  supplier?: Supplier;

  @Column({ type: 'varchar', length: 48, unique: true })
  sku: string;

  @Column({ type: 'varchar', length: 160, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 24, default: 'pcs' })
  unit: string;

  @Column({ name: 'image_url', type: 'varchar', length: 512, nullable: true })
  imageUrl: string | null;

  /** Supplier cost, IDR. */
  @Column({
    name: 'base_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  basePrice: number;

  /** Flat micro-margin, IDR (1000–3000). */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 2000,
    transformer: decimalTransformer,
  })
  margin: number;

  /** MySQL STORED generated column — never written by the ORM. */
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

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => ProductBatchPrice, (p) => p.product)
  batchPrices?: ProductBatchPrice[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}

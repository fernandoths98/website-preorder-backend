import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Bundle } from './bundle.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('bundle_items')
@Unique('uq_bundle_items', ['bundleId', 'productId'])
@Index('idx_bundle_items_product', ['productId'])
export class BundleItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'bundle_id', type: 'bigint', unsigned: true })
  bundleId: string;

  @ManyToOne(() => Bundle, (b) => b.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bundle_id' })
  bundle?: Bundle;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId: string;

  @ManyToOne(() => Product, { eager: false })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({ type: 'int', unsigned: true, default: 1 })
  qty: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BundleItem } from './bundle-item.entity';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

/**
 * A paket: a fixed set of products sold as one unit.
 *
 * Deliberately stores no price. The price is derived from the member
 * products' live base_price at read time, so a supplier promo on any member
 * reprices the paket automatically with no admin action.
 */
@Entity('bundles')
@Index('idx_bundles_active_sort', ['isActive', 'sortOrder'])
export class Bundle {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 160, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  tagline: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'target_market', type: 'varchar', length: 160, nullable: true })
  targetMarket: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 512, nullable: true })
  imageUrl: string | null;

  /** Flat margin for the whole paket, IDR — not per member item. */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 3000,
    transformer: decimalTransformer,
  })
  margin: number;

  @Column({ name: 'max_qty', type: 'int', unsigned: true, nullable: true })
  maxQty: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @OneToMany(() => BundleItem, (i) => i.bundle, { cascade: ['insert', 'update'] })
  items?: BundleItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}

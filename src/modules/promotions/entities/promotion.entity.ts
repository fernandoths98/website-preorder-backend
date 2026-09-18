import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('promotions')
@Index('idx_promotions_active_schedule_sort', ['isActive', 'startsAt', 'endsAt', 'sortOrder'])
export class Promotion {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  eyebrow: string | null;

  @Column({ type: 'varchar', length: 240, nullable: true })
  subtitle: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 512, nullable: true })
  imageUrl: string | null;

  @Column({ name: 'cta_label', type: 'varchar', length: 80, nullable: true })
  ctaLabel: string | null;

  @Column({ name: 'cta_url', type: 'varchar', length: 512, nullable: true })
  ctaUrl: string | null;

  @Column({ name: 'starts_at', type: 'datetime', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'datetime', nullable: true })
  endsAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

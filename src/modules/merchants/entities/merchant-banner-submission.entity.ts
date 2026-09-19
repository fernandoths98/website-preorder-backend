import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MerchantBannerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PUBLISHED = 'published',
}

@Entity('merchant_banner_submissions')
@Index('idx_merchant_banners_status_created', ['status', 'createdAt'])
export class MerchantBannerSubmission {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'merchant_id', type: 'bigint', unsigned: true })
  merchantId: string;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId: string;

  @Column({ name: 'image_url', type: 'varchar', length: 512 })
  imageUrl: string;

  @Column({ type: 'int', unsigned: true })
  width: number;

  @Column({ type: 'int', unsigned: true })
  height: number;

  @Column({ type: 'enum', enum: MerchantBannerStatus, default: MerchantBannerStatus.PENDING })
  status: MerchantBannerStatus;

  @Column({ name: 'review_note', type: 'varchar', length: 500, nullable: true })
  reviewNote: string | null;

  @Column({ name: 'final_image_url', type: 'varchar', length: 512, nullable: true })
  finalImageUrl: string | null;

  @Column({ name: 'promotion_id', type: 'bigint', unsigned: true, nullable: true })
  promotionId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

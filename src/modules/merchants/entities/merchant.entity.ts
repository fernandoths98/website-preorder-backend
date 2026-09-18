import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum MerchantStatus { PENDING='pending', APPROVED='approved', REJECTED='rejected' }

@Entity('merchants')
@Index('idx_merchants_status_created', ['status', 'createdAt'])
export class Merchant {
  @PrimaryGeneratedColumn({ type:'bigint', unsigned:true }) id:string;
  @Column({ type:'varchar', length:160 }) businessName:string;
  @Column({ type:'varchar', length:160, unique:true }) slug:string;
  @Column({ type:'varchar', length:120 }) ownerName:string;
  @Column({ type:'varchar', length:24 }) phone:string;
  @Column({ type:'varchar', length:160, nullable:true }) email:string|null;
  @Column({ type:'varchar', length:80 }) category:string;
  @Column({ type:'varchar', length:255 }) address:string;
  @Column({ type:'text', nullable:true }) description:string|null;
  @Column({ type:'varchar', length:160, nullable:true }) instagram:string|null;
  @Column({ name:'logo_url', type:'varchar', length:512, nullable:true }) logoUrl:string|null;
  @Column({ type:'enum', enum:MerchantStatus, default:MerchantStatus.PENDING }) status:MerchantStatus;
  @Column({ name:'review_note', type:'varchar', length:500, nullable:true }) reviewNote:string|null;
  @CreateDateColumn({ name:'created_at' }) createdAt:Date;
  @UpdateDateColumn({ name:'updated_at' }) updatedAt:Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
export enum MerchantStatus { PENDING='pending', APPROVED='approved', REJECTED='rejected' }
export enum DeliveryMethod { OWN_COURIER='own_courier', THIRD_PARTY='third_party', BOTH='both' }
export enum OutsideRadiusPolicy { UNAVAILABLE='unavailable', PAID='paid' }
export enum DeliveryFeeType { FLAT='flat', PER_KM='per_km' }
@Entity('merchants') @Index('idx_merchants_status_created',['status','createdAt'])
export class Merchant {
 @PrimaryGeneratedColumn({type:'bigint',unsigned:true}) id:string;
 @Column({type:'varchar',length:160}) businessName:string; @Column({type:'varchar',length:160,unique:true}) slug:string;
 @Column({type:'varchar',length:120}) ownerName:string; @Column({type:'varchar',length:24}) phone:string;
 @Column({type:'varchar',length:160,nullable:true}) email:string|null; @Column({name:'password_hash',type:'varchar',length:255,nullable:true,select:false}) passwordHash:string|null; @Column({type:'varchar',length:80}) category:string;
 @Column({type:'varchar',length:255}) address:string; @Column({type:'decimal',precision:10,scale:7,nullable:true}) latitude:number|null;
 @Column({type:'decimal',precision:10,scale:7,nullable:true}) longitude:number|null;
 @Column({type:'text',nullable:true}) description:string|null; @Column({type:'varchar',length:160,nullable:true}) instagram:string|null;
 @Column({name:'logo_url',type:'varchar',length:512,nullable:true}) logoUrl:string|null;
 @Column({name:'delivery_method',type:'enum',enum:DeliveryMethod,nullable:true}) deliveryMethod:DeliveryMethod|null;
 @Column({name:'free_delivery_enabled',type:'boolean',default:false}) freeDeliveryEnabled:boolean;
 @Column({name:'free_delivery_radius_km',type:'decimal',precision:6,scale:2,nullable:true}) freeDeliveryRadiusKm:number|null;
 @Column({name:'outside_radius_policy',type:'enum',enum:OutsideRadiusPolicy,nullable:true}) outsideRadiusPolicy:OutsideRadiusPolicy|null;
 @Column({name:'delivery_fee_type',type:'enum',enum:DeliveryFeeType,nullable:true}) deliveryFeeType:DeliveryFeeType|null;
 @Column({name:'delivery_fee',type:'decimal',precision:12,scale:2,nullable:true}) deliveryFee:number|null;
 @Column({name:'max_delivery_radius_km',type:'decimal',precision:6,scale:2,nullable:true}) maxDeliveryRadiusKm:number|null;
 @Column({name:'third_party_providers',type:'json',nullable:true}) thirdPartyProviders:string[]|null;
 @Column({type:'enum',enum:MerchantStatus,default:MerchantStatus.PENDING}) status:MerchantStatus;
 @Column({name:'review_note',type:'varchar',length:500,nullable:true}) reviewNote:string|null;
 @CreateDateColumn({name:'created_at'}) createdAt:Date; @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
}
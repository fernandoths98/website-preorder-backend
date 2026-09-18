import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'; import { Product } from './product.entity';
@Entity('product_images') @Index('idx_product_images_product_sort',['productId','sortOrder'])
export class ProductImage { @PrimaryGeneratedColumn({type:'bigint',unsigned:true}) id:string; @Column({name:'product_id',type:'bigint',unsigned:true}) productId:string;
@ManyToOne(()=>Product,p=>p.images,{onDelete:'CASCADE'}) @JoinColumn({name:'product_id'}) product:Product;
@Column({name:'image_url',type:'varchar',length:512}) imageUrl:string; @Column({name:'sort_order',type:'tinyint',unsigned:true,default:0}) sortOrder:number;
@Column({name:'is_primary',type:'boolean',default:false}) isPrimary:boolean; @CreateDateColumn({name:'created_at'}) createdAt:Date; }
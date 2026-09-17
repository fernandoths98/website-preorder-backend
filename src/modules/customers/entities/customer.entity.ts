import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** E.164 without '+', e.g. 62812xxxxxxx */
  @Column({ type: 'varchar', length: 20, unique: true })
  phone: string;

  @Column({ name: 'delivery_note', type: 'varchar', length: 255, nullable: true })
  deliveryNote: string | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

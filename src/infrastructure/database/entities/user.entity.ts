import { Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index('users_barbershop_id_idx')
  @ForeignKey(() => BarbershopEntity)
  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index('users_email_unique', { unique: true })
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 16 })
  phone!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

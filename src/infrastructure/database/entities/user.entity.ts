import {
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';

@Entity({ name: 'users' })
@Unique('users_id_barbershop_unique', ['id', 'barbershopId'])
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

  @Column({ type: 'varchar', length: 16, nullable: true })
  phone!: string | null;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

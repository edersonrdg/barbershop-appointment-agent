import {
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';
import { UserEntity } from './user.entity';

// The name index is on (barbershop_id, lower(name)), an expression TypeORM
// cannot describe; it lives in the migration and is skipped by the schema diff.
// The user FK is composite so a barber can only link a user of its own
// barbershop (RN-26); the migration narrows its ON DELETE SET NULL to user_id,
// which TypeORM cannot express either.
@Entity({ name: 'barbers' })
@Index('barbers_name_unique', { synchronize: false })
@Unique('barbers_id_barbershop_unique', ['id', 'barbershopId'])
@ForeignKey(
  () => UserEntity,
  ['userId', 'barbershopId'],
  ['id', 'barbershopId'],
  {
    name: 'barbers_user_fk',
    onDelete: 'SET NULL',
  },
)
export class BarberEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @ForeignKey(() => BarbershopEntity)
  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ type: 'varchar', length: 60 })
  name!: string;

  @Index('barbers_user_id_unique', { unique: true })
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'boolean' })
  active!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

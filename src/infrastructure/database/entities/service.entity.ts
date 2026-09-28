import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';

// The unique index is on (barbershop_id, lower(name)), an expression TypeORM
// cannot describe; it lives in the migration and is skipped by the schema diff.
@Entity({ name: 'services' })
@Index('services_name_unique', { synchronize: false })
@Check('services_price_cents_check', '"price_cents" BETWEEN 0 AND 1000000')
@Check(
  'services_duration_minutes_check',
  '"duration_minutes" BETWEEN 5 AND 480 AND "duration_minutes" % 5 = 0',
)
export class ServiceEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @ForeignKey(() => BarbershopEntity)
  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ type: 'varchar', length: 60 })
  name!: string;

  @Column({ name: 'price_cents', type: 'integer' })
  priceCents!: number;

  @Column({ name: 'duration_minutes', type: 'smallint' })
  durationMinutes!: number;

  @Column({ type: 'boolean' })
  active!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

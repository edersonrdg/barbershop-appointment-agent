import {
  Check,
  Column,
  Entity,
  Exclusion,
  ForeignKey,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import type {
  AppointmentOrigin,
  AppointmentStatus,
} from '../../../domain/entities/appointment';
import { BarberEntity } from './barber.entity';
import { BarbershopEntity } from './barbershop.entity';

// RN-07: the database refuses two confirmed appointments of the same barber
// whose [start, end) ranges overlap, even through a direct INSERT; touching
// ranges are allowed. The btree_gist extension it needs is created only in the
// migration. The barber FK is composite so the barber belongs to the same
// barbershop (RN-26).
@Entity({ name: 'appointments' })
@Unique('appointments_id_barbershop_unique', ['id', 'barbershopId'])
@ForeignKey(
  () => BarberEntity,
  ['barberId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'appointments_barber_fk' },
)
@Check('appointments_ends_after_starts_check', '"ends_at" > "starts_at"')
@Check('appointments_status_check', `"status" IN ('confirmed')`)
@Check('appointments_origin_check', `"origin" IN ('bot', 'manual')`)
@Exclusion(
  'appointments_no_overlap',
  `USING gist ("barber_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&) WHERE ("status" = 'confirmed')`,
)
export class AppointmentEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @ForeignKey(() => BarbershopEntity)
  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ name: 'barber_id', type: 'uuid' })
  barberId!: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ type: 'varchar', length: 20 })
  status!: AppointmentStatus;

  @Column({ type: 'varchar', length: 20 })
  origin!: AppointmentOrigin;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

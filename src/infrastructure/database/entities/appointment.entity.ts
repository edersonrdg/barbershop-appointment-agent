import {
  Check,
  Column,
  Entity,
  Exclusion,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import type {
  AppointmentOrigin,
  AppointmentStatus,
} from '../../../domain/entities/appointment';
import { BarberEntity } from './barber.entity';
import { BarbershopEntity } from './barbershop.entity';
import { ClientEntity } from './client.entity';

// RN-07: the database refuses two appointments of the same barber whose
// [start, end) ranges overlap, even through a direct INSERT; touching
// ranges are allowed. The btree_gist extension it needs is created only in the
// migration. The barber FK is composite so the barber belongs to the same
// barbershop (RN-26), and so is the client FK; a null client skips it.
// Attended and no-show appointments keep holding the slot (RN-03, ATD-04); the
// explicit status list leaves cancelled (US-18) out, which frees the slot.
// US-19: the reminders and the client's confirmation are instants on the
// appointment, null until they happen (door 1).
// The partial no-show index serves the derived no-show count (RN-11, RN-13).
@Entity({ name: 'appointments' })
@Index('appointments_barbershop_starts_idx', ['barbershopId', 'startsAt'])
@Index(
  'appointments_client_no_show_idx',
  ['barbershopId', 'clientId', 'startsAt'],
  { where: `"status" = 'no_show'` },
)
@Unique('appointments_id_barbershop_unique', ['id', 'barbershopId'])
@ForeignKey(
  () => BarberEntity,
  ['barberId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'appointments_barber_fk' },
)
@ForeignKey(
  () => ClientEntity,
  ['clientId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'appointments_client_fk' },
)
@Check('appointments_ends_after_starts_check', '"ends_at" > "starts_at"')
@Check(
  'appointments_status_check',
  `"status" IN ('confirmed', 'attended', 'no_show', 'cancelled')`,
)
@Check('appointments_origin_check', `"origin" IN ('bot', 'manual')`)
@Exclusion(
  'appointments_no_overlap',
  `USING gist ("barber_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&) WHERE ("status" IN ('confirmed', 'attended', 'no_show'))`,
)
export class AppointmentEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @ForeignKey(() => BarbershopEntity)
  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ name: 'barber_id', type: 'uuid' })
  barberId!: string;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId!: string | null;

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

  @Column({ name: 'reminder_24h_sent_at', type: 'timestamptz', nullable: true })
  reminder24hSentAt!: Date | null;

  @Column({ name: 'reminder_1h_sent_at', type: 'timestamptz', nullable: true })
  reminder1hSentAt!: Date | null;

  @Column({ name: 'client_confirmed_at', type: 'timestamptz', nullable: true })
  clientConfirmedAt!: Date | null;
}

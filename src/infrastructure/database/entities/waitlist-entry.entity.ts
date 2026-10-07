import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import type { DayPeriod } from '../../../domain/value-objects/day-period';
import { BarberEntity } from './barber.entity';
import { BarbershopEntity } from './barbershop.entity';
import { ClientEntity } from './client.entity';

// US-24 (door 1): a client waits in one entry per barbershop; a new one
// replaces it. The client and barber FKs are composite so both belong to the
// same barbershop (RN-26); a null barber means any barber.
@Entity({ name: 'waitlist_entries' })
@Unique('waitlist_entries_client_unique', ['barbershopId', 'clientId'])
@Unique('waitlist_entries_id_barbershop_unique', ['id', 'barbershopId'])
@Index('waitlist_entries_queue_idx', ['barbershopId', 'createdAt'])
@ForeignKey(
  () => ClientEntity,
  ['clientId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'waitlist_entries_client_fk', onDelete: 'CASCADE' },
)
@ForeignKey(
  () => BarberEntity,
  ['barberId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'waitlist_entries_barber_fk' },
)
@Check('waitlist_entries_dates_check', '"ends_on" >= "starts_on"')
@Check(
  'waitlist_entries_period_check',
  `"period" IN ('morning', 'afternoon', 'evening')`,
)
export class WaitlistEntryEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @ForeignKey(() => BarbershopEntity, { onDelete: 'CASCADE' })
  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Column({ name: 'barber_id', type: 'uuid', nullable: true })
  barberId!: string | null;

  @Column({ name: 'starts_on', type: 'date' })
  startsOn!: string;

  @Column({ name: 'ends_on', type: 'date' })
  endsOn!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  period!: DayPeriod | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import type { WaitlistOfferStatus } from '../../../usecases/ports/waitlist.repository.port';
import { AppointmentEntity } from './appointment.entity';
import { WaitlistEntryEntity } from './waitlist-entry.entity';

// US-24 (door 1): a freed slot is offered to one entry at a time (RN-15) and
// an entry waits on one offer at a time, even with concurrent runs; an entry
// never gets the same freed slot twice. Offers go with their entry.
@Entity({ name: 'waitlist_offers' })
@Index(
  'waitlist_offers_pending_appointment_unique',
  ['barbershopId', 'appointmentId'],
  {
    unique: true,
    where: `"status" = 'pending'`,
  },
)
@Index('waitlist_offers_pending_entry_unique', ['entryId'], {
  unique: true,
  where: `"status" = 'pending'`,
})
@Unique('waitlist_offers_entry_appointment_unique', [
  'entryId',
  'appointmentId',
])
@ForeignKey(
  () => WaitlistEntryEntity,
  ['entryId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'waitlist_offers_entry_fk', onDelete: 'CASCADE' },
)
@ForeignKey(
  () => AppointmentEntity,
  ['appointmentId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'waitlist_offers_appointment_fk', onDelete: 'CASCADE' },
)
@Check(
  'waitlist_offers_status_check',
  `"status" IN ('pending', 'accepted', 'declined', 'expired')`,
)
export class WaitlistOfferEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ name: 'entry_id', type: 'uuid' })
  entryId!: string;

  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Column({ name: 'barber_id', type: 'uuid' })
  barberId!: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'varchar', length: 10 })
  status!: WaitlistOfferStatus;
}

import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { ConsentChannel } from '../../../usecases/ports/client.repository.port';
import { ClientEntity } from './client.entity';

// US-25 (door 1): every change of the return reminder opt-in, with when and
// where it happened, as proof of consent (CA-25.5, PRD section 15). Rows are
// only ever inserted; the composite FK keeps the client in the barbershop
// (RN-26).
@Entity({ name: 'return_reminder_consents' })
@Index('return_reminder_consents_client_idx', [
  'barbershopId',
  'clientId',
  'recordedAt',
])
@ForeignKey(
  () => ClientEntity,
  ['clientId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'return_reminder_consents_client_fk', onDelete: 'NO ACTION' },
)
@Check('return_reminder_consents_channel_check', `"channel" IN ('whatsapp')`)
export class ReturnReminderConsentEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Column({ type: 'boolean' })
  enabled!: boolean;

  @Column({ type: 'varchar', length: 20 })
  channel!: ConsentChannel;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;
}

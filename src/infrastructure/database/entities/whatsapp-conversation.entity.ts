import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import type { HandoffReason } from '../../../domain/value-objects/handoff-reason';
import { BarbershopEntity } from './barbershop.entity';
import { ClientEntity } from './client.entity';

// US-16 (door 2): the bot's state with a client; never the messages.
@Entity({ name: 'whatsapp_conversations' })
@Check(
  'whatsapp_conversations_pause_reason_check',
  `"pause_reason" IN ('requested', 'not_understood')`,
)
@Check(
  'whatsapp_conversations_pause_check',
  `("paused_at" IS NULL) = ("pause_reason" IS NULL)`,
)
@Check('whatsapp_conversations_failures_check', `"consecutive_failures" >= 0`)
export class WhatsAppConversationEntity {
  @ForeignKey(() => BarbershopEntity, { onDelete: 'CASCADE' })
  @PrimaryColumn({
    name: 'barbershop_id',
    type: 'uuid',
    primaryKeyConstraintName: 'PK_whatsapp_conversations',
  })
  barbershopId!: string;

  @ForeignKey(() => ClientEntity, { onDelete: 'CASCADE' })
  @PrimaryColumn({
    name: 'client_id',
    type: 'uuid',
    primaryKeyConstraintName: 'PK_whatsapp_conversations',
  })
  clientId!: string;

  @Column({ name: 'consecutive_failures', type: 'integer', default: 0 })
  consecutiveFailures!: number;

  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt!: Date | null;

  @Column({ name: 'pause_reason', type: 'text', nullable: true })
  pauseReason!: HandoffReason | null;

  @Column({ name: 'last_activity_at', type: 'timestamptz' })
  lastActivityAt!: Date;
}

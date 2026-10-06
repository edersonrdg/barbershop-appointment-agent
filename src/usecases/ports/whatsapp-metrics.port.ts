import type { ReminderKind } from '../../domain/value-objects/appointment-reminder';
import type { HandoffReason } from '../../domain/value-objects/handoff-reason';

export const WHATSAPP_METRICS = Symbol('WhatsAppMetrics');

export type PrivacyNoticeOutcome = 'sent' | 'failed';

export type ClientReplyKind =
  | 'answer'
  | 'off_topic'
  | 'fallback'
  | 'unavailable'
  | 'handoff'
  | 'booking'
  | 'booked'
  | 'cancelled'
  | 'rescheduled'
  | 'presence_confirmed'
  | 'nothing_to_confirm'
  | 'suspended';

export type BotResumeTrigger = 'owner' | 'timeout';

export type ReminderOutcome = 'sent' | 'failed';

export interface WhatsAppMetrics {
  disconnected(): void;
  clientCreated(): void;
  privacyNotice(outcome: PrivacyNoticeOutcome): void;
  reply(kind: ClientReplyKind): void;
  handoff(reason: HandoffReason): void;
  botResumed(trigger: BotResumeTrigger): void;
  reminder(kind: ReminderKind, outcome: ReminderOutcome): void;
  presenceConfirmed(): void;
}

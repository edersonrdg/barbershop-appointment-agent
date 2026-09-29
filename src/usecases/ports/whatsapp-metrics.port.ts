export const WHATSAPP_METRICS = Symbol('WhatsAppMetrics');

export type PrivacyNoticeOutcome = 'sent' | 'failed';

export type ClientReplyKind =
  'answer' | 'off_topic' | 'fallback' | 'unavailable';

export interface WhatsAppMetrics {
  disconnected(): void;
  clientCreated(): void;
  privacyNotice(outcome: PrivacyNoticeOutcome): void;
  reply(kind: ClientReplyKind): void;
}

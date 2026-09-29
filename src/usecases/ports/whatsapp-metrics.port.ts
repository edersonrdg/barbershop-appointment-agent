export const WHATSAPP_METRICS = Symbol('WhatsAppMetrics');

export type PrivacyNoticeOutcome = 'sent' | 'failed';

export interface WhatsAppMetrics {
  disconnected(): void;
  clientCreated(): void;
  privacyNotice(outcome: PrivacyNoticeOutcome): void;
}

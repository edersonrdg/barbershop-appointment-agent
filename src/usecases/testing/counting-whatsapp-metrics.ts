import {
  PrivacyNoticeOutcome,
  WhatsAppMetrics,
} from '../ports/whatsapp-metrics.port';

export class CountingWhatsAppMetrics implements WhatsAppMetrics {
  disconnections = 0;
  clientsCreated = 0;
  readonly privacyNotices: PrivacyNoticeOutcome[] = [];

  disconnected(): void {
    this.disconnections += 1;
  }

  clientCreated(): void {
    this.clientsCreated += 1;
  }

  privacyNotice(outcome: PrivacyNoticeOutcome): void {
    this.privacyNotices.push(outcome);
  }
}

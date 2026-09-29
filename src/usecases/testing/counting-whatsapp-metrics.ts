import { WhatsAppMetrics } from '../ports/whatsapp-metrics.port';

export class CountingWhatsAppMetrics implements WhatsAppMetrics {
  disconnections = 0;

  disconnected(): void {
    this.disconnections += 1;
  }
}

import { Counter, Registry } from 'prom-client';
import { WhatsAppMetrics } from '../../usecases/ports/whatsapp-metrics.port';

export class PrometheusWhatsAppMetrics implements WhatsAppMetrics {
  private readonly disconnectionsTotal: Counter;

  constructor(registry: Registry) {
    this.disconnectionsTotal = new Counter({
      name: 'whatsapp_disconnections_total',
      help: 'Total de quedas da conexão do WhatsApp das barbearias',
      registers: [registry],
    });
  }

  disconnected(): void {
    this.disconnectionsTotal.inc();
  }
}

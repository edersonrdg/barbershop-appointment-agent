import { Counter, Registry } from 'prom-client';
import {
  PaymentEventGroup,
  PaymentEventOutcome,
  PaymentMetrics,
} from '../../usecases/ports/payment-metrics.port';

export class PrometheusPaymentMetrics implements PaymentMetrics {
  private readonly webhookEventsTotal: Counter<'event_group' | 'outcome'>;

  constructor(registry: Registry) {
    this.webhookEventsTotal = new Counter({
      name: 'payment_webhook_events_total',
      help: 'Total de eventos do gateway de pagamento recebidos, por grupo e desfecho',
      labelNames: ['event_group', 'outcome'],
      registers: [registry],
    });
  }

  webhookEvent(group: PaymentEventGroup, outcome: PaymentEventOutcome): void {
    this.webhookEventsTotal.inc({ event_group: group, outcome });
  }
}

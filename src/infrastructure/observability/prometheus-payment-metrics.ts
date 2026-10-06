import { Counter, Registry } from 'prom-client';
import type { SuspensionReason } from '../../domain/entities/barbershop-subscription';
import {
  PaymentEventGroup,
  PaymentEventOutcome,
  PaymentMetrics,
} from '../../usecases/ports/payment-metrics.port';

export class PrometheusPaymentMetrics implements PaymentMetrics {
  private readonly webhookEventsTotal: Counter<'event_group' | 'outcome'>;
  private readonly blockedWritesTotal: Counter<'reason'>;

  constructor(registry: Registry) {
    this.webhookEventsTotal = new Counter({
      name: 'payment_webhook_events_total',
      help: 'Total de eventos do gateway de pagamento recebidos, por grupo e desfecho',
      labelNames: ['event_group', 'outcome'],
      registers: [registry],
    });
    this.blockedWritesTotal = new Counter({
      name: 'subscription_blocked_writes_total',
      help: 'Total de escritas do painel recusadas por assinatura inativa, por motivo',
      labelNames: ['reason'],
      registers: [registry],
    });
  }

  webhookEvent(group: PaymentEventGroup, outcome: PaymentEventOutcome): void {
    this.webhookEventsTotal.inc({ event_group: group, outcome });
  }

  blockedWrite(reason: SuspensionReason): void {
    this.blockedWritesTotal.inc({ reason });
  }
}

import {
  PaymentEventGroup,
  PaymentEventOutcome,
  PaymentMetrics,
} from '../ports/payment-metrics.port';

export class CountingPaymentMetrics implements PaymentMetrics {
  readonly webhookEvents: {
    group: PaymentEventGroup;
    outcome: PaymentEventOutcome;
  }[] = [];

  webhookEvent(group: PaymentEventGroup, outcome: PaymentEventOutcome): void {
    this.webhookEvents.push({ group, outcome });
  }
}

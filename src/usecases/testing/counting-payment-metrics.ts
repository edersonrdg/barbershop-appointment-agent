import type { SuspensionReason } from '../../domain/entities/barbershop-subscription';
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
  readonly blockedWrites: SuspensionReason[] = [];

  webhookEvent(group: PaymentEventGroup, outcome: PaymentEventOutcome): void {
    this.webhookEvents.push({ group, outcome });
  }

  blockedWrite(reason: SuspensionReason): void {
    this.blockedWrites.push(reason);
  }
}

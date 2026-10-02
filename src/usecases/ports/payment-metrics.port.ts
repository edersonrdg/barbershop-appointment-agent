export const PAYMENT_METRICS = Symbol('PaymentMetrics');

export type PaymentEventGroup =
  'payment_confirmed' | 'payment_failed' | 'other';

export type PaymentEventOutcome =
  'applied' | 'duplicate' | 'ignored' | 'failed';

export interface PaymentMetrics {
  webhookEvent(group: PaymentEventGroup, outcome: PaymentEventOutcome): void;
}

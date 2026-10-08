export const RETURN_REMINDER_METRICS = Symbol('ReturnReminderMetrics');

export type ReturnReminderMessageKind = 'question' | 'invite';

export type ReturnReminderMessageOutcome = 'sent' | 'failed';

// US-25: labels are these closed sets, never a client or barbershop.
export interface ReturnReminderMetrics {
  message(
    kind: ReturnReminderMessageKind,
    outcome: ReturnReminderMessageOutcome,
  ): void;
  optInChanged(enabled: boolean): void;
}

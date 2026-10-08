import {
  ReturnReminderMessageKind,
  ReturnReminderMessageOutcome,
  ReturnReminderMetrics,
} from '../ports/return-reminder-metrics.port';

export class CountingReturnReminderMetrics implements ReturnReminderMetrics {
  readonly messages: string[] = [];
  readonly optInChanges: boolean[] = [];

  message(
    kind: ReturnReminderMessageKind,
    outcome: ReturnReminderMessageOutcome,
  ): void {
    this.messages.push(`${kind}:${outcome}`);
  }

  optInChanged(enabled: boolean): void {
    this.optInChanges.push(enabled);
  }
}

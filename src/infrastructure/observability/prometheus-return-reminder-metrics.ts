import { Counter, Registry } from 'prom-client';
import {
  ReturnReminderMessageKind,
  ReturnReminderMessageOutcome,
  ReturnReminderMetrics,
} from '../../usecases/ports/return-reminder-metrics.port';

// US-25: labels are the closed sets of the port, never a client or barbershop.
export class PrometheusReturnReminderMetrics implements ReturnReminderMetrics {
  private readonly messagesTotal: Counter<'kind' | 'outcome'>;
  private readonly optInChangesTotal: Counter<'enabled'>;

  constructor(registry: Registry) {
    this.messagesTotal = new Counter({
      name: 'return_reminder_messages_total',
      help: 'Total de perguntas e convites do lembrete de retorno, por tipo e desfecho',
      labelNames: ['kind', 'outcome'],
      registers: [registry],
    });
    this.optInChangesTotal = new Counter({
      name: 'return_reminder_opt_in_changes_total',
      help: 'Total de mudanças do opt-in do lembrete de retorno, pelo novo valor',
      labelNames: ['enabled'],
      registers: [registry],
    });
  }

  message(
    kind: ReturnReminderMessageKind,
    outcome: ReturnReminderMessageOutcome,
  ): void {
    this.messagesTotal.inc({ kind, outcome });
  }

  optInChanged(enabled: boolean): void {
    this.optInChangesTotal.inc({ enabled: String(enabled) });
  }
}

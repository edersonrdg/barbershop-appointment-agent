import { Counter, Registry } from 'prom-client';
import type { ReminderKind } from '../../domain/value-objects/appointment-reminder';
import type { HandoffReason } from '../../domain/value-objects/handoff-reason';
import {
  BotResumeTrigger,
  ClientReplyKind,
  PrivacyNoticeOutcome,
  ReminderOutcome,
  WhatsAppMetrics,
} from '../../usecases/ports/whatsapp-metrics.port';

export class PrometheusWhatsAppMetrics implements WhatsAppMetrics {
  private readonly disconnectionsTotal: Counter;
  private readonly clientsCreatedTotal: Counter;
  private readonly privacyNoticesTotal: Counter<'outcome'>;
  private readonly repliesTotal: Counter<'kind'>;
  private readonly handoffsTotal: Counter<'reason'>;
  private readonly botResumesTotal: Counter<'trigger'>;
  private readonly remindersTotal: Counter<'kind' | 'outcome'>;
  private readonly presenceConfirmationsTotal: Counter;

  constructor(registry: Registry) {
    this.disconnectionsTotal = new Counter({
      name: 'whatsapp_disconnections_total',
      help: 'Total de quedas da conexão do WhatsApp das barbearias',
      registers: [registry],
    });
    this.clientsCreatedTotal = new Counter({
      name: 'whatsapp_clients_created_total',
      help: 'Total de clientes cadastrados no primeiro contato pelo WhatsApp',
      registers: [registry],
    });
    this.privacyNoticesTotal = new Counter({
      name: 'whatsapp_privacy_notices_total',
      help: 'Total de avisos de privacidade enviados pelo WhatsApp, por desfecho',
      labelNames: ['outcome'],
      registers: [registry],
    });
    this.repliesTotal = new Counter({
      name: 'whatsapp_replies_total',
      help: 'Total de respostas do bot enviadas pelo WhatsApp, por tipo',
      labelNames: ['kind'],
      registers: [registry],
    });
    this.handoffsTotal = new Counter({
      name: 'whatsapp_handoffs_total',
      help: 'Total de conversas transferidas para atendimento humano, por motivo',
      labelNames: ['reason'],
      registers: [registry],
    });
    this.botResumesTotal = new Counter({
      name: 'whatsapp_bot_resumes_total',
      help: 'Total de conversas devolvidas ao bot depois de uma transferência, por gatilho',
      labelNames: ['trigger'],
      registers: [registry],
    });
    this.remindersTotal = new Counter({
      name: 'whatsapp_reminders_total',
      help: 'Total de lembretes de agendamento enviados pelo WhatsApp, por tipo e desfecho',
      labelNames: ['kind', 'outcome'],
      registers: [registry],
    });
    this.presenceConfirmationsTotal = new Counter({
      name: 'whatsapp_presence_confirmations_total',
      help: 'Total de agendamentos confirmados pelo cliente em resposta ao lembrete',
      registers: [registry],
    });
  }

  disconnected(): void {
    this.disconnectionsTotal.inc();
  }

  clientCreated(): void {
    this.clientsCreatedTotal.inc();
  }

  privacyNotice(outcome: PrivacyNoticeOutcome): void {
    this.privacyNoticesTotal.inc({ outcome });
  }

  reply(kind: ClientReplyKind): void {
    this.repliesTotal.inc({ kind });
  }

  handoff(reason: HandoffReason): void {
    this.handoffsTotal.inc({ reason });
  }

  botResumed(trigger: BotResumeTrigger): void {
    this.botResumesTotal.inc({ trigger });
  }

  reminder(kind: ReminderKind, outcome: ReminderOutcome): void {
    this.remindersTotal.inc({ kind, outcome });
  }

  presenceConfirmed(): void {
    this.presenceConfirmationsTotal.inc();
  }
}

import { Barbershop } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { ClientRepository } from '../ports/client.repository.port';
import { IdGenerator } from '../ports/id-generator.port';
import { ReturnReminderChoice } from '../ports/message-interpreter.port';
import { ReturnReminderMetrics } from '../ports/return-reminder-metrics.port';
import {
  RETURN_REMINDER_DISABLED_TEXT,
  returnReminderEnabledText,
} from '../send-return-reminders/return-reminder-text';

export interface ReturnReminderReply {
  kind: 'return_reminder';
  text: string;
}

// US-25 (RF-20, RN-21, CA-25.3, CA-25.5): the client turns the return reminder
// on or off from WhatsApp at any moment. The change and its consent record are
// stored before the reply goes out; asking for the value already in force
// records nothing and gets the same reply.
export class ChangeReturnReminderViaWhatsAppUseCase {
  constructor(
    private readonly clients: ClientRepository,
    private readonly bookingRules: BookingRulesRepository,
    private readonly metrics: ReturnReminderMetrics,
    private readonly ids: IdGenerator,
  ) {}

  async execute({
    barbershop,
    client,
    choice,
    now,
  }: {
    barbershop: Barbershop;
    client: Client;
    choice: ReturnReminderChoice;
    now: Date;
  }): Promise<ReturnReminderReply> {
    const enabled = choice === 'enable';
    const changed = await this.clients.changeReturnReminder({
      id: this.ids.next(),
      barbershopId: barbershop.id,
      clientId: client.id,
      enabled,
      channel: 'whatsapp',
      recordedAt: now,
    });
    if (changed) this.metrics.optInChanged(enabled);
    if (!enabled) {
      return { kind: 'return_reminder', text: RETURN_REMINDER_DISABLED_TEXT };
    }
    const rules =
      (await this.bookingRules.findByBarbershopId(barbershop.id)) ??
      BookingRules.defaults();
    return {
      kind: 'return_reminder',
      text: returnReminderEnabledText(rules.returnReminderDays),
    };
  }
}

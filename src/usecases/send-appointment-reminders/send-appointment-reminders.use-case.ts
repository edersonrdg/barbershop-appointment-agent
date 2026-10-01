import {
  isReminderDue,
  REMINDER_KINDS,
  reminderLeadMinutes,
} from '../../domain/value-objects/appointment-reminder';
import { AppointmentRepository } from '../ports/appointment.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { ScheduleQuery } from '../ports/schedule.query.port';
import { WhatsAppConnectionRepository } from '../ports/whatsapp-connection.repository.port';
import { WhatsAppConnector } from '../ports/whatsapp-connector.port';
import { WhatsAppMetrics } from '../ports/whatsapp-metrics.port';
import { reminderText } from './reminder-text';

const MS_PER_MINUTE = 60 * 1000;

export interface ReminderBarbershopFailure {
  barbershopId: string;
  error: unknown;
}

export interface SendAppointmentRemindersResult {
  sent: number;
  failed: number;
  failures: ReminderBarbershopFailure[];
}

// US-19 (RF-16, RF-17, RN-18) and AD-009: barbershop by barbershop, every
// reminder that is due goes out once. The claim is stored before the send and
// kept when the send fails, so a reminder is never sent twice.
export class SendAppointmentRemindersUseCase {
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly connections: WhatsAppConnectionRepository,
    private readonly schedule: ScheduleQuery,
    private readonly appointments: AppointmentRepository,
    private readonly connector: WhatsAppConnector,
    private readonly metrics: WhatsAppMetrics,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<SendAppointmentRemindersResult> {
    const now = this.clock.now();
    const result: SendAppointmentRemindersResult = {
      sent: 0,
      failed: 0,
      failures: [],
    };
    for (const barbershopId of await this.barbershops.listIds()) {
      try {
        await this.sendFor(barbershopId, now, result);
      } catch (error) {
        result.failures.push({ barbershopId, error });
      }
    }
    return result;
  }

  // While the WhatsApp is not connected nothing is claimed, so the reminders
  // still in their window go out once it connects again (AC 11).
  private async sendFor(
    barbershopId: string,
    now: Date,
    result: SendAppointmentRemindersResult,
  ): Promise<void> {
    const connection = await this.connections.findByBarbershopId(barbershopId);
    if (connection?.status !== 'connected') return;
    const barbershop = await this.barbershops.findById(barbershopId);
    if (!barbershop) return;
    for (const kind of REMINDER_KINDS) {
      const until = new Date(
        now.getTime() + reminderLeadMinutes(kind) * MS_PER_MINUTE,
      );
      const pending = await this.schedule.listPendingReminders(
        barbershopId,
        kind,
        now,
        until,
      );
      for (const entry of pending) {
        if (!entry.client || !isReminderDue(kind, entry, now)) continue;
        const claimed = await this.appointments.claimReminder(
          barbershopId,
          entry.id,
          kind,
          now,
        );
        if (!claimed) continue;
        try {
          await this.connector.sendText(
            barbershopId,
            entry.client.phone,
            reminderText(kind, barbershop, entry),
          );
        } catch {
          this.metrics.reminder(kind, 'failed');
          result.failed += 1;
          continue;
        }
        this.metrics.reminder(kind, 'sent');
        result.sent += 1;
      }
    }
  }
}

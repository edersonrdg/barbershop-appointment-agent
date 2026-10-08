import { Barbershop } from '../../domain/entities/barbershop';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { GetSuspensionReasonUseCase } from '../get-suspension-reason/get-suspension-reason.use-case';
import { AppointmentRepository } from '../ports/appointment.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { ClientRepository } from '../ports/client.repository.port';
import { Clock } from '../ports/clock.port';
import { ConversationRepository } from '../ports/conversation.repository.port';
import { NoShowLedger } from '../ports/no-show-ledger.port';
import {
  ReturnReminderMessageKind,
  ReturnReminderMetrics,
} from '../ports/return-reminder-metrics.port';
import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';
import { WhatsAppConnectionRepository } from '../ports/whatsapp-connection.repository.port';
import { WhatsAppConnector } from '../ports/whatsapp-connector.port';
import { clientNoShowStatus } from '../shared/client-no-show-status';
import { handoffExpiredBefore } from '../shared/handoff-expiry';
import {
  returnReminderInviteText,
  returnReminderQuestionText,
} from './return-reminder-text';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** CA-25.1: the question goes out up to this long after the attendance. */
const QUESTION_WINDOW_MS = 24 * HOUR_MS;

export interface ReturnReminderBarbershopFailure {
  barbershopId: string;
  error: unknown;
}

export interface ReturnReminderSendFailure {
  barbershopId: string;
  clientId: string;
  kind: ReturnReminderMessageKind;
  error: unknown;
}

export interface SendReturnRemindersResult {
  questions: number;
  invites: number;
  failed: number;
  failures: ReturnReminderBarbershopFailure[];
  sendFailures: ReturnReminderSendFailure[];
}

interface BarbershopRound {
  barbershop: Barbershop;
  timezone: BarbershopTimezone;
  rules: BookingRules;
  now: Date;
  result: SendReturnRemindersResult;
}

// US-25 (RF-19, RN-19, CA-25.1, CA-25.2, CA-25.4) and AD-009: barbershop by
// barbershop, a client attended in the last 24h is asked once whether they
// want the return reminder, and a client who opted in is invited once per
// attendance when the configured days have passed and nothing is booked. Each
// message is claimed before it is sent and never sent again (AD-019).
export class SendReturnRemindersUseCase {
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly connections: WhatsAppConnectionRepository,
    private readonly suspension: GetSuspensionReasonUseCase,
    private readonly schedule: ScheduleQuery,
    private readonly clients: ClientRepository,
    private readonly appointments: AppointmentRepository,
    private readonly bookingRules: BookingRulesRepository,
    private readonly ledger: NoShowLedger,
    private readonly conversations: ConversationRepository,
    private readonly connector: WhatsAppConnector,
    private readonly metrics: ReturnReminderMetrics,
    private readonly clock: Clock,
    private readonly resumeAfterHours: number,
  ) {}

  async execute(): Promise<SendReturnRemindersResult> {
    const now = this.clock.now();
    const result: SendReturnRemindersResult = {
      questions: 0,
      invites: 0,
      failed: 0,
      failures: [],
      sendFailures: [],
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

  // Nothing is claimed while the WhatsApp is not connected or the barbershop
  // is suspended (RF-43), so the messages still due go out afterwards.
  private async sendFor(
    barbershopId: string,
    now: Date,
    result: SendReturnRemindersResult,
  ): Promise<void> {
    const connection = await this.connections.findByBarbershopId(barbershopId);
    if (connection?.status !== 'connected') return;
    if (await this.suspension.execute(barbershopId)) return;
    const barbershop = await this.barbershops.findById(barbershopId);
    if (!barbershop) return;
    const round: BarbershopRound = {
      barbershop,
      timezone: BarbershopTimezone.create(barbershop.timezone),
      rules:
        (await this.bookingRules.findByBarbershopId(barbershopId)) ??
        BookingRules.defaults(),
      now,
      result,
    };
    await this.askAttended(round);
    await this.inviteDue(round);
  }

  private async askAttended(round: BarbershopRound): Promise<void> {
    const { barbershop, now } = round;
    const attended = await this.schedule.listAttendedEndedIn(
      barbershop.id,
      new Date(now.getTime() - QUESTION_WINDOW_MS),
      now,
    );
    const asked = new Set<string>();
    for (const entry of attended) {
      if (!entry.client || asked.has(entry.client.id)) continue;
      asked.add(entry.client.id);
      const client = await this.clients.findById(
        barbershop.id,
        entry.client.id,
      );
      if (
        !client ||
        client.returnReminderEnabled ||
        client.returnReminderAskedAt !== null
      ) {
        continue;
      }
      if (await this.paused(barbershop.id, client.id, now)) continue;
      const claimed = await this.clients.claimReturnReminderQuestion(
        barbershop.id,
        client.id,
        now,
      );
      if (!claimed) continue;
      await this.send(
        round,
        'question',
        entry.client,
        returnReminderQuestionText(
          barbershop.name,
          round.rules.returnReminderDays,
        ),
      );
    }
  }

  private async inviteDue(round: BarbershopRound): Promise<void> {
    const { barbershop, timezone, rules, now } = round;
    const due = await this.schedule.listReturnRemindersDue(
      barbershop.id,
      new Date(now.getTime() - rules.returnReminderDays * DAY_MS),
    );
    for (const entry of due) {
      if (!entry.client) continue;
      if (!(await this.invitable(barbershop.id, entry.client.id, now))) {
        continue;
      }
      const claimed = await this.appointments.claimReturnReminder(
        barbershop.id,
        entry.id,
        now,
      );
      if (!claimed) continue;
      await this.send(
        round,
        'invite',
        entry.client,
        returnReminderInviteText(
          entry.client.name,
          localDaysBetween(timezone, entry.endsAt, now),
          barbershop.name,
        ),
      );
    }
  }

  // RN-19: a client with a booked appointment is not invited; RN-12: a
  // blocked client cannot book from the bot.
  private async invitable(
    barbershopId: string,
    clientId: string,
    now: Date,
  ): Promise<boolean> {
    const booked = (
      await this.schedule.listForClient(barbershopId, clientId, null)
    ).some((entry) => entry.status === 'confirmed' && entry.startsAt > now);
    if (booked) return false;
    const { selfBookingBlocked } = await clientNoShowStatus(
      this.ledger,
      this.bookingRules,
      barbershopId,
      clientId,
    );
    if (selfBookingBlocked) return false;
    return !(await this.paused(barbershopId, clientId, now));
  }

  // RN-23: while a person handles the conversation the bot does not write.
  private paused(
    barbershopId: string,
    clientId: string,
    now: Date,
  ): Promise<boolean> {
    return this.conversations.isPaused(
      barbershopId,
      clientId,
      handoffExpiredBefore(now, this.resumeAfterHours),
    );
  }

  private async send(
    { barbershop, result }: BarbershopRound,
    kind: ReturnReminderMessageKind,
    client: NonNullable<ScheduleEntry['client']>,
    text: string,
  ): Promise<void> {
    try {
      await this.connector.sendText(barbershop.id, client.phone, text);
    } catch (error) {
      this.metrics.message(kind, 'failed');
      result.failed += 1;
      result.sendFailures.push({
        barbershopId: barbershop.id,
        clientId: client.id,
        kind,
        error,
      });
      return;
    }
    this.metrics.message(kind, 'sent');
    if (kind === 'question') result.questions += 1;
    else result.invites += 1;
  }
}

function localDaysBetween(
  timezone: BarbershopTimezone,
  from: Date,
  to: Date,
): number {
  const day = (instant: Date): number =>
    Date.parse(`${timezone.localDateOf(instant)}T00:00:00Z`);
  return Math.round((day(to) - day(from)) / DAY_MS);
}

import {
  Appointment,
  AppointmentStatus,
} from '../../domain/entities/appointment';
import { Barbershop } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
} from '../../domain/entities/whatsapp-connection';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { AnswerClientQuestionUseCase } from '../answer-client-question/answer-client-question.use-case';
import { ChangeReturnReminderViaWhatsAppUseCase } from '../change-return-reminder-via-whatsapp/change-return-reminder-via-whatsapp.use-case';
import { GetSuspensionReasonUseCase } from '../get-suspension-reason/get-suspension-reason.use-case';
import { MessageInterpretation } from '../ports/message-interpreter.port';
import { ScheduleQuery } from '../ports/schedule.query.port';
import { SendReturnRemindersUseCase } from '../send-return-reminders/send-return-reminders.use-case';
import { CountingReturnReminderMetrics } from './counting-return-reminder-metrics';
import { CountingWhatsAppMetrics } from './counting-whatsapp-metrics';
import { FakeMessageInterpreter } from './fake-message-interpreter';
import { FakeWhatsAppConnector } from './fake-whatsapp-connector';
import { InMemoryInboundMessageRepository } from './in-memory-inbound-message.repository';
import { InMemorySubscriptionRepository } from './in-memory-subscription.repository';
import { InMemoryWhatsAppConnectionRepository } from './in-memory-whatsapp-connection.repository';
import { subscriptionOf } from './subscription-fixtures';
import {
  BOOKING_NOW,
  local,
  setupWhatsAppBooking,
} from './whatsapp-booking-fixtures';

export const ANA_PHONE = '+5511911110001';
export const BRUNO_PHONE = '+5511911110002';
const MINUTE_MS = 60 * 1000;

/** Each client is attended by its own barber, so their histories never overlap. */
const BARBER_OF: Record<string, string> = {
  ana: 'joao',
  bruno: 'pedro',
  carlos: 'pedro',
};

const NO_INTERPRETATION: MessageInterpretation = {
  topics: [],
  services: [],
  unknownServices: [],
  offTopic: false,
  humanRequested: false,
  bookingRequested: false,
  barber: null,
  anyBarber: false,
  date: null,
  period: null,
  time: null,
  cancelRequested: false,
  rescheduleRequested: false,
  confirmRequested: false,
  choice: null,
  addOnAccepted: false,
  waitlistAccepted: false,
  offerDeclined: false,
  returnReminder: null,
};

export function interpretation(
  partial: Partial<MessageInterpretation> = {},
): MessageInterpretation {
  return { ...NO_INTERPRETATION, ...partial };
}

// Delegates to the scenario's schedule and fails every read of the barbershops
// in `failing` (AD-009).
class FailingScheduleQuery implements ScheduleQuery {
  readonly failing = new Set<string>();

  constructor(private readonly inner: ScheduleQuery) {}

  private guard(barbershopId: string): void {
    if (this.failing.has(barbershopId)) {
      throw new Error(`schedule of ${barbershopId} is unavailable`);
    }
  }

  listStartingIn(...args: Parameters<ScheduleQuery['listStartingIn']>) {
    this.guard(args[0]);
    return this.inner.listStartingIn(...args);
  }

  listOverlapping(...args: Parameters<ScheduleQuery['listOverlapping']>) {
    this.guard(args[0]);
    return this.inner.listOverlapping(...args);
  }

  findById(...args: Parameters<ScheduleQuery['findById']>) {
    this.guard(args[0]);
    return this.inner.findById(...args);
  }

  listForClient(...args: Parameters<ScheduleQuery['listForClient']>) {
    this.guard(args[0]);
    return this.inner.listForClient(...args);
  }

  listPendingReminders(
    ...args: Parameters<ScheduleQuery['listPendingReminders']>
  ) {
    this.guard(args[0]);
    return this.inner.listPendingReminders(...args);
  }

  listAttendedEndedIn(
    ...args: Parameters<ScheduleQuery['listAttendedEndedIn']>
  ) {
    this.guard(args[0]);
    return this.inner.listAttendedEndedIn(...args);
  }

  listReturnRemindersDue(
    ...args: Parameters<ScheduleQuery['listReturnRemindersDue']>
  ) {
    this.guard(args[0]);
    return this.inner.listReturnRemindersDue(...args);
  }
}

// US-25 scenario on top of the US-17 one: Carlos, Ana and Bruno are clients of
// barbershop A with a connected WhatsApp; the return reminder job and the bot
// run on the same repositories, with `returnReminderDays` 30.
export async function setupReturnReminders({
  now = BOOKING_NOW,
}: { now?: Date } = {}) {
  const scenario = await setupWhatsAppBooking({ now });
  const {
    barbershop,
    barbershops,
    bookingRules,
    services,
    clients,
    clock,
    conversations,
    ledger,
    ids,
    appointments,
    store,
  } = scenario;
  const addClient = (id: string, name: string, phone: string): Client => {
    const client = Client.create({
      id,
      barbershopId: barbershop.id,
      name,
      phone: PhoneNumber.create(phone),
      now,
    });
    clients.add(client);
    return client;
  };
  const ana = addClient('ana', 'Ana Lima', ANA_PHONE);
  const bruno = addClient('bruno', 'Bruno Reis', BRUNO_PHONE);

  const connections = new InMemoryWhatsAppConnectionRepository();
  const connect = async (
    status: WhatsAppConnectionStatus,
    barbershopId = barbershop.id,
  ): Promise<void> =>
    connections.save(
      WhatsAppConnection.restore({
        barbershopId,
        status,
        disconnectedAt: null,
        updatedAt: now,
      }),
    );
  await connect('connected');
  const subscriptions = new InMemorySubscriptionRepository();
  const suspend = (): void =>
    subscriptions.add(
      subscriptionOf({ barbershopId: barbershop.id, trialEndsAt: now }),
    );
  const unsuspend = (): void =>
    subscriptions.add(
      subscriptionOf({
        barbershopId: barbershop.id,
        trialEndsAt: new Date(now.getTime() + 30 * 24 * 60 * MINUTE_MS),
      }),
    );
  const suspension = new GetSuspensionReasonUseCase(subscriptions, clock, 5);
  const connector = new FakeWhatsAppConnector();
  const metrics = new CountingReturnReminderMetrics();
  const schedule = new FailingScheduleQuery(scenario.schedule);
  const send = new SendReturnRemindersUseCase(
    barbershops,
    connections,
    suspension,
    schedule,
    clients,
    appointments,
    bookingRules,
    ledger,
    conversations,
    connector,
    metrics,
    clock,
    12,
  );

  const interpreter = new FakeMessageInterpreter();
  const whatsAppMetrics = new CountingWhatsAppMetrics();
  const bot = new AnswerClientQuestionUseCase(
    connections,
    barbershops,
    services,
    new InMemoryInboundMessageRepository(),
    interpreter,
    connector,
    whatsAppMetrics,
    clock,
    clients,
    conversations,
    12,
    scenario.booking,
    scenario.presence,
    suspension,
    new ChangeReturnReminderViaWhatsAppUseCase(
      clients,
      bookingRules,
      metrics,
      ids,
    ),
  );
  let messages = 0;
  /** The client with `phone` writes, and the model reads `partial`. */
  const say = (phone: string, partial: Partial<MessageInterpretation>) => {
    interpreter.next = interpretation(partial);
    messages += 1;
    return bot.execute({
      barbershopId: barbershop.id,
      phone,
      messageId: `message-${messages}`,
      text: 'mensagem',
    });
  };

  let stored = 0;
  /** A 30 min Corte of the client starting at `startsAt`, attended by default. */
  const attend = async (
    clientId: string,
    startsAt: Date,
    {
      status = 'attended',
      barbershopId = barbershop.id,
      id,
    }: {
      status?: AppointmentStatus;
      barbershopId?: string;
      id?: string;
    } = {},
  ): Promise<string> => {
    stored += 1;
    const appointmentId = id ?? `${clientId}-${stored}`;
    await appointments.create(
      Appointment.restore({
        id: appointmentId,
        barbershopId,
        barberId: BARBER_OF[clientId] ?? 'joao',
        clientId,
        serviceIds: ['corte'],
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * MINUTE_MS),
        status,
        origin: 'manual',
        createdAt: startsAt,
      }),
    );
    return appointmentId;
  };
  /** Moves the clock to the local time of `date` in São Paulo. */
  const at = (date: string, time: string): void => {
    clock.current = local(date, time);
  };
  const setDays = (days: number): void => {
    const current = store.bookingRules.get(barbershop.id);
    const defaults = BookingRules.defaults();
    store.bookingRules.set(
      barbershop.id,
      BookingRules.create({
        minimumAdvanceMinutes: current?.minimumAdvanceMinutes ?? 60,
        cancellationDeadlineMinutes: defaults.cancellationDeadlineMinutes,
        noShowLimit: defaults.noShowLimit,
        waitlistOfferMinutes: defaults.waitlistOfferMinutes,
        returnReminderDays: days,
      }),
    );
  };
  const pause = async (clientId: string): Promise<void> => {
    await conversations.enter(
      barbershop.id,
      clientId,
      clock.now(),
      new Date(0),
    );
    await conversations.pause(
      barbershop.id,
      clientId,
      'requested',
      clock.now(),
    );
  };
  const resume = (clientId: string): Promise<boolean> =>
    conversations.resume(barbershop.id, clientId);
  const clientOf = async (clientId: string): Promise<Client> => {
    const found = await clients.findById(barbershop.id, clientId);
    if (!found) throw new Error(`client ${clientId} not found`);
    return found;
  };
  const textsTo = (phone: string): string[] =>
    connector.sentTexts
      .filter((sent) => sent.phone === phone)
      .map((sent) => sent.text);
  const changesOf = (clientId: string) =>
    clients.returnReminderChanges.filter(
      (change) => change.clientId === clientId,
    );
  // A barbershop listed before A, connected, whose schedule cannot be read.
  const addFailingBarbershop = async (): Promise<void> => {
    store.barbershops.unshift(
      Barbershop.restore({
        id: 'barbershop-0',
        name: 'Barbearia Zero',
        address: null,
        timezone: BarbershopTimezone.create('America/Sao_Paulo'),
        openingHours: barbershop.openingHours,
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(now.getTime() + 30 * 24 * 60 * MINUTE_MS),
        createdAt: now,
      }),
    );
    await connect('connected', 'barbershop-0');
    schedule.failing.add('barbershop-0');
  };

  return {
    ...scenario,
    ana,
    bruno,
    connections,
    connect,
    subscriptions,
    suspend,
    unsuspend,
    connector,
    metrics,
    whatsAppMetrics,
    send,
    interpreter,
    say,
    attend,
    at,
    setDays,
    pause,
    resume,
    clientOf,
    textsTo,
    changesOf,
    addFailingBarbershop,
  };
}

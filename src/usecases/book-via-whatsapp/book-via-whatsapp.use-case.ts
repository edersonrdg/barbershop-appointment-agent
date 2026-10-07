import { Barber } from '../../domain/entities/barber';
import { Barbershop } from '../../domain/entities/barbershop';
import { BarbershopService } from '../../domain/entities/barbershop-service';
import { Client } from '../../domain/entities/client';
import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { BarberUnavailableError } from '../../domain/errors/barber-unavailable.error';
import { MinimumAdvanceNotMetError } from '../../domain/errors/minimum-advance-not-met.error';
import { OutsideOpeningHoursError } from '../../domain/errors/outside-opening-hours.error';
import { OutsideWorkingHoursError } from '../../domain/errors/outside-working-hours.error';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { ServiceNotPerformedError } from '../../domain/errors/service-not-performed.error';
import { SlotInPastError } from '../../domain/errors/slot-in-past.error';
import { AvailableSlot } from '../../domain/value-objects/barber-day-schedule';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { TimeOfDay } from '../../domain/value-objects/time-of-day';
import { WEEKDAY_LABELS } from '../../domain/value-objects/weekday';
import { BookAppointmentUseCase } from '../book-appointment/book-appointment.use-case';
import { ListAvailableSlotsUseCase } from '../list-available-slots/list-available-slots.use-case';
import { AppointmentMetrics } from '../ports/appointment-metrics.port';
import { AppointmentRepository } from '../ports/appointment.repository.port';
import { BarberRepository } from '../ports/barber.repository.port';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import {
  AppointmentCandidate,
  BookingDraft,
  ConversationRepository,
  DraftAction,
  OfferedSlot,
} from '../ports/conversation.repository.port';
import { IdGenerator } from '../ports/id-generator.port';
import {
  BookingPeriod,
  MAX_CHOICE,
  MAX_OFFERED_SLOTS,
  MessageInterpretation,
  MessageInterpreterInput,
} from '../ports/message-interpreter.port';
import { NoShowLedger } from '../ports/no-show-ledger.port';
import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';
import { performsAll } from '../shared/booking-context';
import { clientNoShowStatus } from '../shared/client-no-show-status';
import {
  addOnText,
  appointmentLabel,
  appointmentListText,
  askBarberText,
  askServiceText,
  barberNotAptText,
  bookedText,
  cancellationDeadlineText,
  cancelledText,
  emptyDateText,
  minimumAdvanceText,
  NO_UPCOMING_APPOINTMENT_TEXT,
  noBarberText,
  noServicesText,
  nothingFreeText,
  offerText,
  optionLabel,
  PAST_DATE_NOTICE,
  SLOT_TAKEN_NOTICE,
  timeTakenText,
  UNKNOWN_OPTION_NOTICE,
} from './booking-reply';

const MS_PER_MINUTE = 60 * 1000;
// Assumption of the plan: an offer older than this is not chosen from (AC 20).
const DRAFT_TTL_MINUTES = 60;
// Assumption of the plan: the bot looks 7 local days ahead (AC 3, AC 28).
const SEARCH_DAYS = 7;
const NOON_MINUTES = 12 * 60;
const EVENING_MINUTES = 18 * 60;

type Criteria = Omit<
  BookingDraft,
  'id' | 'action' | 'candidates' | 'targetAppointmentId' | 'offer' | 'updatedAt'
>;

export interface BookingPreparation {
  /** The draft still in force, if any. */
  draft: BookingDraft | null;
  /** Every barber of the barbershop, active or not, by name. */
  barbers: Barber[];
  /** US-18: the appointments listed in the draft, in its order. */
  candidates: ScheduleEntry[];
  interpreterInput: Pick<
    MessageInterpreterInput,
    | 'today'
    | 'barberNames'
    | 'offeredOptions'
    | 'appointmentOptions'
    | 'suggestedAddOn'
  >;
}

export interface HandleBookingInput {
  barbershop: Barbershop;
  client: Client;
  /** Active services of the barbershop. */
  services: readonly BarbershopService[];
  preparation: BookingPreparation;
  interpretation: MessageInterpretation;
  now: Date;
}

/** `notice` comes before the hand-off message (US-18). */
export type BookingOutcome =
  | {
      type: 'handoff';
      reason: 'blocked_client' | 'late_cancellation';
      notice?: string;
    }
  | { type: 'not_understood' }
  | { type: 'silent' }
  | { type: 'reply'; kind: 'booking'; text: string }
  | {
      type: 'reply';
      kind: 'booked' | 'cancelled' | 'rescheduled';
      text: string;
      appointmentId: string;
    };

interface Context {
  barbershop: Barbershop;
  client: Client;
  services: readonly BarbershopService[];
  barbers: Barber[];
  timezone: BarbershopTimezone;
  now: Date;
  /** What the drafts saved from this context are for (US-18). */
  action: DraftAction;
  targetAppointmentId: string | null;
}

const BLOCKED: BookingOutcome = { type: 'handoff', reason: 'blocked_client' };

// US-17: books from the WhatsApp with the availability engine of US-07 (RF-01
// to RF-03). The model only says what the client asked; slots come from the
// engine and a booking only from an option the bot offered (AD-013). US-18:
// cancels and reschedules the client's own appointments (RF-04) within the
// cancellation deadline (RN-09); a new slot is searched and booked like a new
// booking, and only then the old appointment is cancelled (RN-10).
export class BookViaWhatsAppUseCase {
  constructor(
    private readonly barbersRepository: BarberRepository,
    private readonly bookingRules: BookingRulesRepository,
    private readonly ledger: NoShowLedger,
    private readonly conversations: ConversationRepository,
    private readonly listSlots: ListAvailableSlotsUseCase,
    private readonly book: BookAppointmentUseCase,
    private readonly ids: IdGenerator,
    private readonly schedule: ScheduleQuery,
    private readonly appointments: AppointmentRepository,
    private readonly metrics: AppointmentMetrics,
  ) {}

  async prepare(
    barbershop: Barbershop,
    clientId: string,
    now: Date,
    services: readonly BarbershopService[],
  ): Promise<BookingPreparation> {
    const timezone = BarbershopTimezone.create(barbershop.timezone);
    const [barbers, stored] = await Promise.all([
      this.barbersRepository.listByBarbershop(barbershop.id),
      this.conversations.findDraft(barbershop.id, clientId),
    ]);
    const draft = stored && inForce(stored, now) ? stored : null;
    const candidates = draft?.candidates.length
      ? listed(
          draft.candidates,
          await this.schedule.listForClient(barbershop.id, clientId, null),
        )
      : [];
    const today = timezone.localDateOf(now);
    const pendingAddOn = draft?.addOnSuggestion?.pending
      ? services.find(
          (service) => service.id === draft.addOnSuggestion?.serviceId,
        )
      : undefined;
    return {
      draft,
      barbers,
      candidates,
      interpreterInput: {
        today: {
          date: today,
          weekday:
            WEEKDAY_LABELS[timezone.weekdayOf(today)].toLocaleLowerCase(
              'pt-BR',
            ),
        },
        barberNames: barbers
          .filter((barber) => barber.active)
          .map((barber) => barber.name),
        offeredOptions: (draft?.offer ?? []).map((slot) =>
          optionLabel(timezone, labeled(barbers, slot)),
        ),
        appointmentOptions: candidates.map((entry) =>
          appointmentLabel(timezone, entry),
        ),
        suggestedAddOn: pendingAddOn?.name ?? null,
      },
    };
  }

  async handle(input: HandleBookingInput): Promise<BookingOutcome> {
    const { barbershop, client, interpretation, preparation } = input;
    // RN-12: a blocked client is handed to the team instead of booking
    // (CA-17.6), but may still cancel (US-18).
    const { selfBookingBlocked: blocked } = await clientNoShowStatus(
      this.ledger,
      this.bookingRules,
      barbershop.id,
      client.id,
    );
    const context: Context = {
      barbershop,
      client,
      services: input.services,
      barbers: preparation.barbers,
      timezone: BarbershopTimezone.create(barbershop.timezone),
      now: input.now,
      action: 'book',
      targetAppointmentId: null,
    };
    // Assumption of the plan: a new request to cancel or reschedule replaces
    // any draft in progress. Rescheduling wins when both are asked, since it
    // cancels nothing before the client picks a new slot.
    if (interpretation.cancelRequested || interpretation.rescheduleRequested) {
      return this.locate(
        context,
        interpretation.rescheduleRequested ? 'reschedule' : 'cancel',
        merge(context, null, interpretation),
        blocked,
      );
    }
    const draft = preparation.draft;
    if (interpretation.choice !== null) {
      if (!draft) return { type: 'not_understood' };
      if (draft.candidates.length > 0) {
        return this.pick(
          context,
          draft,
          preparation.candidates,
          interpretation.choice,
          blocked,
        );
      }
      if (draft.offer.length === 0) return { type: 'not_understood' };
      if (blocked) return BLOCKED;
      return this.choose(
        withDraft(context, draft),
        draft,
        interpretation.choice,
      );
    }
    if (blocked) return BLOCKED;
    const base = draft && continues(draft) ? draft : null;
    return this.search(
      base ? withDraft(context, base) : context,
      answerAddOn(
        context,
        base,
        interpretation,
        merge(context, base, interpretation),
      ),
      [],
    );
  }

  // CA-18.2: the client's upcoming appointments are found and, when there is
  // more than one, listed for the client to pick one.
  private async locate(
    context: Context,
    action: 'cancel' | 'reschedule',
    preferences: Criteria,
    blocked: boolean,
  ): Promise<BookingOutcome> {
    const { barbershop, client } = context;
    const upcoming = await this.upcoming(context);
    if (upcoming.length === 0) {
      await this.conversations.clearDraft(barbershop.id, client.id);
      return this.reply([NO_UPCOMING_APPOINTMENT_TEXT]);
    }
    // RN-12: rescheduling books, so a blocked client goes to the team.
    if (action === 'reschedule' && blocked) return BLOCKED;
    if (upcoming.length === 1) {
      return this.act(context, action, upcoming[0], preferences);
    }
    await this.conversations.saveDraft(barbershop.id, client.id, {
      id: this.ids.next(),
      action,
      candidates: upcoming.map((entry) => ({
        appointmentId: entry.id,
        barberId: entry.barber.id,
        startsAt: entry.startsAt,
      })),
      targetAppointmentId: null,
      ...preferences,
      serviceIds: [],
      offer: [],
      updatedAt: context.now,
    });
    return this.reply([appointmentListText(context.timezone, upcoming)]);
  }

  private async pick(
    context: Context,
    draft: BookingDraft,
    listedEntries: ScheduleEntry[],
    choice: number,
    blocked: boolean,
  ): Promise<BookingOutcome> {
    const candidate = draft.candidates[choice - 1];
    if (!candidate) {
      return this.reply([
        UNKNOWN_OPTION_NOTICE,
        appointmentListText(context.timezone, listedEntries),
      ]);
    }
    const action = draft.action === 'reschedule' ? 'reschedule' : 'cancel';
    if (action === 'reschedule' && blocked) return BLOCKED;
    const entry = (await this.upcoming(context)).find(
      (upcoming) => upcoming.id === candidate.appointmentId,
    );
    // The appointment changed since it was listed: start over.
    if (!entry) {
      return this.locate(context, action, criteriaOf(draft), blocked);
    }
    return this.act(context, action, entry, criteriaOf(draft));
  }

  // RN-09: within the deadline the bot cancels or reschedules; after it, the
  // team decides (CA-18.4).
  private async act(
    context: Context,
    action: 'cancel' | 'reschedule',
    entry: ScheduleEntry,
    preferences: Criteria,
  ): Promise<BookingOutcome> {
    const { cancellationDeadlineMinutes } = await this.rules(
      context.barbershop.id,
    );
    const deadline =
      entry.startsAt.getTime() - cancellationDeadlineMinutes * MS_PER_MINUTE;
    if (context.now.getTime() > deadline) {
      return {
        type: 'handoff',
        reason: 'late_cancellation',
        notice: cancellationDeadlineText(cancellationDeadlineMinutes),
      };
    }
    if (action === 'cancel') return this.cancel(context, entry);

    const named = preferences.anyBarber || preferences.barberId !== null;
    return this.search(
      { ...context, action: 'reschedule', targetAppointmentId: entry.id },
      {
        ...preferences,
        serviceIds: entry.services.map((service) => service.id),
        barberId: named ? preferences.barberId : entry.barber.id,
      },
      [],
    );
  }

  // CA-18.1: two concurrent cancellations end in the same state.
  private async cancel(
    context: Context,
    entry: ScheduleEntry,
  ): Promise<BookingOutcome> {
    const { barbershop, client } = context;
    await this.release(barbershop.id, entry.id);
    await this.conversations.clearDraft(barbershop.id, client.id);
    return {
      type: 'reply',
      kind: 'cancelled',
      appointmentId: entry.id,
      text: cancelledText(context.timezone, entry),
    };
  }

  // CA-18.5: leaving the confirmed status is what frees the slot (door 4).
  private async release(
    barbershopId: string,
    appointmentId: string,
  ): Promise<void> {
    const stored = await this.appointments.findById(
      barbershopId,
      appointmentId,
    );
    if (stored?.status !== 'confirmed') return;
    await this.appointments.saveStatus(stored.cancel());
    this.metrics.cancelled('bot');
  }

  private async upcoming(context: Context): Promise<ScheduleEntry[]> {
    const entries = await this.schedule.listForClient(
      context.barbershop.id,
      context.client.id,
      null,
    );
    return entries
      .filter(
        (entry) => entry.status === 'confirmed' && entry.startsAt > context.now,
      )
      .slice(0, MAX_CHOICE);
  }

  private async choose(
    context: Context,
    draft: BookingDraft,
    choice: number,
  ): Promise<BookingOutcome> {
    const slot = draft.offer[choice - 1];
    if (!slot) {
      const services = servicesOf(context, draft.serviceIds);
      return this.reply([
        UNKNOWN_OPTION_NOTICE,
        offerText(
          context.timezone,
          services,
          draft.offer.map((offered) => labeled(context.barbers, offered)),
        ),
      ]);
    }
    // AD-013: of two messages choosing from this offer, only one books.
    const consumed = await this.conversations.consumeDraft(
      context.barbershop.id,
      context.client.id,
      draft.id,
    );
    if (!consumed) return { type: 'silent' };

    const criteria = criteriaOf(draft);
    try {
      const appointment = await this.book.execute({
        barbershopId: context.barbershop.id,
        barberId: slot.barberId,
        serviceIds: draft.serviceIds,
        startsAt: slot.startsAt,
        origin: 'bot',
        client: { client: context.client, isNew: false },
      });
      // CA-18.3: the old appointment is released only once the new one exists.
      const rescheduled = draft.targetAppointmentId !== null;
      if (draft.targetAppointmentId !== null) {
        await this.release(context.barbershop.id, draft.targetAppointmentId);
      }
      return {
        type: 'reply',
        kind: rescheduled ? 'rescheduled' : 'booked',
        appointmentId: appointment.id,
        text: bookedText({
          timezone: context.timezone,
          services: servicesOf(context, draft.serviceIds),
          barberName: labeled(context.barbers, slot).barberName,
          startsAt: slot.startsAt,
          address: context.barbershop.address,
          ...(rescheduled && { heading: 'Agendamento remarcado!' }),
        }),
      };
    } catch (error) {
      // CA-17.4: the slot was taken or closed while the offer waited.
      if (
        error instanceof AppointmentConflictError ||
        error instanceof BarberUnavailableError ||
        error instanceof OutsideWorkingHoursError ||
        error instanceof OutsideOpeningHoursError
      ) {
        return this.search(context, { ...criteria, time: null }, [
          SLOT_TAKEN_NOTICE,
        ]);
      }
      // CA-17.5: the minimum advance ran out while the offer waited.
      if (
        error instanceof MinimumAdvanceNotMetError ||
        error instanceof SlotInPastError
      ) {
        return this.firstValid(context, criteria);
      }
      if (
        error instanceof ServiceNotFoundError ||
        error instanceof BarberNotFoundError ||
        error instanceof ServiceNotPerformedError
      ) {
        return this.search(context, merge(context, null, null, criteria), []);
      }
      throw error;
    }
  }

  private async search(
    context: Context,
    criteria: Criteria,
    notices: string[],
  ): Promise<BookingOutcome> {
    const { barbershop, client } = context;
    const services = servicesOf(context, criteria.serviceIds);
    if (services.length === 0) {
      if (context.services.length === 0) {
        await this.conversations.clearDraft(barbershop.id, client.id);
        return this.reply([...notices, noServicesText(barbershop.name)]);
      }
      await this.saveDraft(context, criteria, []);
      return this.reply([...notices, askServiceText(context.services)]);
    }
    const apt = context.barbers.filter(
      (barber) => barber.active && performsAll(barber, criteria.serviceIds),
    );
    if (apt.length === 0) {
      await this.conversations.clearDraft(barbershop.id, client.id);
      return this.reply([...notices, noBarberText(services)]);
    }
    // US-23: one add-on is suggested before searching, once per draft (RF-06).
    if (context.action === 'book' && criteria.addOnSuggestion === null) {
      const addOn = suggestible(context, criteria, services, apt);
      if (addOn) {
        await this.saveDraft(
          context,
          {
            ...criteria,
            addOnSuggestion: { serviceId: addOn.id, pending: true },
          },
          [],
        );
        return this.reply([...notices, addOnText(addOn, services)]);
      }
    }
    const aptNames = apt.map((barber) => barber.name);
    if (criteria.barberId !== null) {
      const barber = context.barbers.find(
        (candidate) => candidate.id === criteria.barberId,
      );
      if (barber?.active && !apt.includes(barber)) {
        await this.saveDraft(context, { ...criteria, barberId: null }, []);
        return this.reply([
          ...notices,
          barberNotAptText(barber.name, services, aptNames),
        ]);
      }
      if (!barber?.active) {
        return this.search(context, { ...criteria, barberId: null }, notices);
      }
    } else if (!criteria.anyBarber) {
      // RF-03: the bot asks for a preference before offering.
      await this.saveDraft(context, criteria, []);
      return this.reply([...notices, askBarberText(services, aptNames)]);
    }

    const rules = await this.rules(barbershop.id);
    const today = context.timezone.localDateOf(context.now);
    let current = criteria;
    if (current.date !== null && current.date < today) {
      notices.push(PAST_DATE_NOTICE);
      current = { ...current, date: null, period: null, time: null };
    }
    if (current.time !== null) {
      const date = current.date ?? today;
      const requested = context.timezone.toUtc(
        date,
        TimeOfDay.create(current.time),
      );
      const earliest = new Date(
        context.now.getTime() + rules.minimumAdvanceMinutes * MS_PER_MINUTE,
      );
      if (requested < earliest) {
        return this.firstValid(context, current, notices);
      }
      const slots = await this.slotsOn(context, current, date);
      const exact = slots.find(
        (slot) => slot.startsAt.getTime() === requested.getTime(),
      );
      if (exact) return this.offer(context, current, [exact], notices);
      notices.push(timeTakenText(context.timezone, date, current.time));
      return this.inPeriod(
        context,
        current,
        date,
        periodOfMinutes(TimeOfDay.create(current.time).minutes),
        notices,
      );
    }
    if (current.date !== null) {
      return this.inPeriod(
        context,
        current,
        current.date,
        current.period,
        notices,
      );
    }
    const slots = await this.collect(
      context,
      current,
      today,
      (slot) => this.matchesPeriod(context, slot, current.period),
      MAX_OFFERED_SLOTS,
    );
    return this.offerOrNothing(context, current, today, slots, notices);
  }

  // CA-17.7: an empty period falls back to the other periods of the date and
  // then to the following days.
  private async inPeriod(
    context: Context,
    criteria: Criteria,
    date: string,
    period: BookingPeriod | null,
    notices: string[],
  ): Promise<BookingOutcome> {
    const onDate = (await this.slotsOn(context, criteria, date))
      .filter((slot) => this.matchesPeriod(context, slot, period))
      .slice(0, MAX_OFFERED_SLOTS);
    if (onDate.length > 0) {
      return this.offer(context, criteria, onDate, notices);
    }
    notices.push(emptyDateText(context.timezone, date, period));
    const others = await this.collect(
      context,
      criteria,
      date,
      (slot) =>
        context.timezone.localDateOf(slot.startsAt) !== date ||
        !this.matchesPeriod(context, slot, period),
      MAX_OFFERED_SLOTS,
    );
    return this.offerOrNothing(context, criteria, date, others, notices);
  }

  // CA-17.5: the rule is explained and the first valid slot is offered.
  private async firstValid(
    context: Context,
    criteria: Criteria,
    notices: string[] = [],
  ): Promise<BookingOutcome> {
    const rules = await this.rules(context.barbershop.id);
    const today = context.timezone.localDateOf(context.now);
    const next = { ...criteria, date: null, period: null, time: null };
    const slots = await this.collect(context, next, today, () => true, 1);
    return this.offerOrNothing(context, next, today, slots, [
      ...notices,
      minimumAdvanceText(rules.minimumAdvanceMinutes),
    ]);
  }

  private async offerOrNothing(
    context: Context,
    criteria: Criteria,
    firstDate: string,
    slots: AvailableSlot[],
    notices: string[],
  ): Promise<BookingOutcome> {
    if (slots.length > 0) return this.offer(context, criteria, slots, notices);
    await this.saveDraft(context, criteria, []);
    return this.reply([
      ...notices,
      nothingFreeText(
        context.timezone,
        servicesOf(context, criteria.serviceIds),
        addDays(firstDate, SEARCH_DAYS - 1),
      ),
    ]);
  }

  private async offer(
    context: Context,
    criteria: Criteria,
    slots: AvailableSlot[],
    notices: string[],
  ): Promise<BookingOutcome> {
    const offered = slots.map(({ barberId, startsAt }) => ({
      barberId,
      startsAt,
    }));
    await this.saveDraft(context, criteria, offered);
    return this.reply([
      ...notices,
      offerText(
        context.timezone,
        servicesOf(context, criteria.serviceIds),
        offered.map((slot) => labeled(context.barbers, slot)),
      ),
    ]);
  }

  private async collect(
    context: Context,
    criteria: Criteria,
    firstDate: string,
    keep: (slot: AvailableSlot) => boolean,
    limit: number,
  ): Promise<AvailableSlot[]> {
    const found: AvailableSlot[] = [];
    for (let day = 0; day < SEARCH_DAYS && found.length < limit; day += 1) {
      const slots = await this.slotsOn(
        context,
        criteria,
        addDays(firstDate, day),
      );
      found.push(...slots.filter(keep).slice(0, limit - found.length));
    }
    return found;
  }

  private slotsOn(
    context: Context,
    criteria: Criteria,
    date: string,
  ): Promise<AvailableSlot[]> {
    return this.listSlots.execute({
      barbershopId: context.barbershop.id,
      barberId: criteria.anyBarber ? null : criteria.barberId,
      serviceIds: criteria.serviceIds,
      date,
      origin: 'bot',
    });
  }

  private matchesPeriod(
    context: Context,
    slot: AvailableSlot,
    period: BookingPeriod | null,
  ): boolean {
    if (period === null) return true;
    const minutes = TimeOfDay.create(
      context.timezone.localTimeOf(slot.startsAt),
    ).minutes;
    return periodOfMinutes(minutes) === period;
  }

  private async rules(barbershopId: string): Promise<BookingRules> {
    return (
      (await this.bookingRules.findByBarbershopId(barbershopId)) ??
      BookingRules.defaults()
    );
  }

  private saveDraft(
    context: Context,
    criteria: Criteria,
    offer: OfferedSlot[],
  ): Promise<void> {
    return this.conversations.saveDraft(
      context.barbershop.id,
      context.client.id,
      {
        id: this.ids.next(),
        action: context.action,
        candidates: [],
        targetAppointmentId: context.targetAppointmentId,
        ...criteria,
        offer,
        updatedAt: context.now,
      },
    );
  }

  private reply(blocks: string[]): BookingOutcome {
    return { type: 'reply', kind: 'booking', text: blocks.join('\n\n') };
  }
}

function inForce(draft: BookingDraft, now: Date): boolean {
  return (
    now.getTime() - draft.updatedAt.getTime() <
    DRAFT_TTL_MINUTES * MS_PER_MINUTE
  );
}

// A booking, or a rescheduling whose appointment is known, takes the next
// message's criteria; a list of appointments does not.
function continues(draft: BookingDraft): boolean {
  if (draft.action === 'book') return true;
  return draft.action === 'reschedule' && draft.targetAppointmentId !== null;
}

function withDraft(context: Context, draft: BookingDraft): Context {
  return {
    ...context,
    action: draft.action,
    targetAppointmentId: draft.targetAppointmentId,
  };
}

function listed(
  candidates: readonly AppointmentCandidate[],
  entries: readonly ScheduleEntry[],
): ScheduleEntry[] {
  return candidates.flatMap((candidate) => {
    const entry = entries.find((item) => item.id === candidate.appointmentId);
    return entry ? [entry] : [];
  });
}

function criteriaOf(draft: BookingDraft): Criteria {
  return {
    serviceIds: [...draft.serviceIds],
    barberId: draft.barberId,
    anyBarber: draft.anyBarber,
    date: draft.date,
    period: draft.period,
    time: draft.time,
    addOnSuggestion: draft.addOnSuggestion && { ...draft.addOnSuggestion },
  };
}

// AC 9: what the message says replaces what the draft had; the rest is kept.
function merge(
  context: Context,
  draft: BookingDraft | null,
  interpretation: MessageInterpretation | null,
  base: Criteria | null = draft ? criteriaOf(draft) : null,
): Criteria {
  const kept: Criteria = base ?? {
    serviceIds: [],
    barberId: null,
    anyBarber: false,
    date: null,
    period: null,
    time: null,
    addOnSuggestion: null,
  };
  const activeIds = new Set(context.services.map((service) => service.id));
  const keptServices = kept.serviceIds.every((id) => activeIds.has(id))
    ? kept.serviceIds
    : [];
  if (!interpretation) return { ...kept, serviceIds: keptServices };

  const named = interpretation.services.length
    ? [
        ...new Set(
          interpretation.services.flatMap((name) => {
            const service = context.services.find(
              (candidate) => key(candidate.name) === key(name),
            );
            return service ? [service.id] : [];
          }),
        ),
      ]
    : null;
  let barber = { barberId: kept.barberId, anyBarber: kept.anyBarber };
  const barberName = interpretation.barber;
  if (interpretation.anyBarber) {
    barber = { barberId: null, anyBarber: true };
  } else if (barberName !== null) {
    const found = context.barbers.find(
      (candidate) =>
        candidate.active && key(candidate.name) === key(barberName),
    );
    barber = { barberId: found?.id ?? null, anyBarber: false };
  }
  return {
    serviceIds: named ?? keptServices,
    ...barber,
    date: interpretation.date ?? kept.date,
    period: interpretation.period ?? kept.period,
    time: interpretation.time ?? kept.time,
    addOnSuggestion: kept.addOnSuggestion,
  };
}

// CA-23.2, CA-23.3: the message after the suggestion answers it. Accepting adds
// the add-on to the services already in the draft; anything else declines.
// Either way it is not suggested again.
function answerAddOn(
  context: Context,
  draft: BookingDraft | null,
  interpretation: MessageInterpretation,
  criteria: Criteria,
): Criteria {
  const suggestion = criteria.addOnSuggestion;
  if (!draft || !suggestion?.pending) return criteria;
  const answered = {
    ...criteria,
    addOnSuggestion: { ...suggestion, pending: false },
  };
  const addOn = context.services.find(
    (service) => service.id === suggestion.serviceId,
  );
  if (!addOn) return answered;
  const accepted =
    interpretation.addOnAccepted ||
    interpretation.services.some((name) => key(name) === key(addOn.name));
  if (!accepted) return answered;
  const kept = draft.serviceIds.filter((id) =>
    context.services.some((service) => service.id === id),
  );
  return {
    ...answered,
    serviceIds: [...new Set([...kept, ...criteria.serviceIds, addOn.id])],
  };
}

// AC 2: the first active add-on of the requested services, in their order and
// then in the order registered, that the named barber (or, without one, some
// apt barber) performs together with the request.
function suggestible(
  context: Context,
  criteria: Criteria,
  services: readonly BarbershopService[],
  apt: readonly Barber[],
): BarbershopService | null {
  const named =
    criteria.barberId === null
      ? null
      : (context.barbers.find(
          (barber) => barber.active && barber.id === criteria.barberId,
        ) ?? null);
  const performers = named ? [named] : apt;
  for (const service of services) {
    for (const addOnId of service.suggestedAddOnIds) {
      const addOn = context.services.find((active) => active.id === addOnId);
      if (!addOn || criteria.serviceIds.includes(addOnId)) continue;
      const ids = [...criteria.serviceIds, addOnId];
      if (performers.some((barber) => performsAll(barber, ids))) return addOn;
    }
  }
  return null;
}

function servicesOf(
  context: Context,
  serviceIds: readonly string[],
): BarbershopService[] {
  return serviceIds.flatMap((id) => {
    const service = context.services.find((candidate) => candidate.id === id);
    return service ? [service] : [];
  });
}

function labeled(
  barbers: readonly Barber[],
  slot: OfferedSlot,
): { barberName: string; startsAt: Date } {
  const barber = barbers.find((candidate) => candidate.id === slot.barberId);
  return { barberName: barber?.name ?? '', startsAt: slot.startsAt };
}

function periodOfMinutes(minutes: number): BookingPeriod {
  if (minutes < NOON_MINUTES) return 'morning';
  if (minutes < EVENING_MINUTES) return 'afternoon';
  return 'evening';
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function key(name: string): string {
  return name.trim().toLocaleLowerCase('pt-BR');
}

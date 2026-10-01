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
import { BarberRepository } from '../ports/barber.repository.port';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import {
  BookingDraft,
  ConversationRepository,
  OfferedSlot,
} from '../ports/conversation.repository.port';
import { IdGenerator } from '../ports/id-generator.port';
import {
  BookingPeriod,
  MAX_OFFERED_SLOTS,
  MessageInterpretation,
  MessageInterpreterInput,
} from '../ports/message-interpreter.port';
import { NoShowLedger } from '../ports/no-show-ledger.port';
import { performsAll } from '../shared/booking-context';
import { clientNoShowStatus } from '../shared/client-no-show-status';
import {
  askBarberText,
  askServiceText,
  barberNotAptText,
  bookedText,
  emptyDateText,
  minimumAdvanceText,
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

type Criteria = Omit<BookingDraft, 'id' | 'offer' | 'updatedAt'>;

export interface BookingPreparation {
  /** The draft still in force, if any. */
  draft: BookingDraft | null;
  /** Every barber of the barbershop, active or not, by name. */
  barbers: Barber[];
  interpreterInput: Pick<
    MessageInterpreterInput,
    'today' | 'barberNames' | 'offeredOptions'
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

export type BookingOutcome =
  | { type: 'handoff' }
  | { type: 'not_understood' }
  | { type: 'silent' }
  | { type: 'reply'; kind: 'booking'; text: string }
  | { type: 'reply'; kind: 'booked'; text: string; appointmentId: string };

interface Context {
  barbershop: Barbershop;
  client: Client;
  services: readonly BarbershopService[];
  barbers: Barber[];
  timezone: BarbershopTimezone;
  now: Date;
}

// US-17: books from the WhatsApp with the availability engine of US-07 (RF-01
// to RF-03). The model only says what the client asked; slots come from the
// engine and a booking only from an option the bot offered (AD-013).
export class BookViaWhatsAppUseCase {
  constructor(
    private readonly barbersRepository: BarberRepository,
    private readonly bookingRules: BookingRulesRepository,
    private readonly ledger: NoShowLedger,
    private readonly conversations: ConversationRepository,
    private readonly listSlots: ListAvailableSlotsUseCase,
    private readonly book: BookAppointmentUseCase,
    private readonly ids: IdGenerator,
  ) {}

  async prepare(
    barbershop: Barbershop,
    clientId: string,
    now: Date,
  ): Promise<BookingPreparation> {
    const timezone = BarbershopTimezone.create(barbershop.timezone);
    const [barbers, stored] = await Promise.all([
      this.barbersRepository.listByBarbershop(barbershop.id),
      this.conversations.findDraft(barbershop.id, clientId),
    ]);
    const draft = stored && inForce(stored, now) ? stored : null;
    const today = timezone.localDateOf(now);
    return {
      draft,
      barbers,
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
      },
    };
  }

  async handle(input: HandleBookingInput): Promise<BookingOutcome> {
    const { barbershop, client, interpretation, preparation } = input;
    const { selfBookingBlocked } = await clientNoShowStatus(
      this.ledger,
      this.bookingRules,
      barbershop.id,
      client.id,
    );
    // RN-12: a blocked client is handed to the team instead (CA-17.6).
    if (selfBookingBlocked) return { type: 'handoff' };

    const context: Context = {
      barbershop,
      client,
      services: input.services,
      barbers: preparation.barbers,
      timezone: BarbershopTimezone.create(barbershop.timezone),
      now: input.now,
    };
    const draft = preparation.draft;
    if (interpretation.choice !== null) {
      if (!draft || draft.offer.length === 0) return { type: 'not_understood' };
      return this.choose(context, draft, interpretation.choice);
    }
    return this.search(context, merge(context, draft, interpretation), []);
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
      return {
        type: 'reply',
        kind: 'booked',
        appointmentId: appointment.id,
        text: bookedText({
          timezone: context.timezone,
          services: servicesOf(context, draft.serviceIds),
          barberName: labeled(context.barbers, slot).barberName,
          startsAt: slot.startsAt,
          address: context.barbershop.address,
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
      { id: this.ids.next(), ...criteria, offer, updatedAt: context.now },
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

function criteriaOf(draft: BookingDraft): Criteria {
  return {
    serviceIds: [...draft.serviceIds],
    barberId: draft.barberId,
    anyBarber: draft.anyBarber,
    date: draft.date,
    period: draft.period,
    time: draft.time,
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
  };
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

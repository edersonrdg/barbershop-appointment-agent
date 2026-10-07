import { Barbershop } from '../../domain/entities/barbershop';
import { WaitlistEntry } from '../../domain/entities/waitlist-entry';
import { DomainError } from '../../domain/errors/domain.error';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { waitlistOfferText } from '../book-via-whatsapp/booking-reply';
import { GetSuspensionReasonUseCase } from '../get-suspension-reason/get-suspension-reason.use-case';
import { ListAvailableSlotsUseCase } from '../list-available-slots/list-available-slots.use-case';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { ClientRepository } from '../ports/client.repository.port';
import { Clock } from '../ports/clock.port';
import { ConversationRepository } from '../ports/conversation.repository.port';
import { IdGenerator } from '../ports/id-generator.port';
import { NoShowLedger } from '../ports/no-show-ledger.port';
import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';
import { ServiceRepository } from '../ports/service.repository.port';
import { WaitlistMetrics } from '../ports/waitlist-metrics.port';
import {
  WaitlistOffer,
  WaitlistRepository,
} from '../ports/waitlist.repository.port';
import { WhatsAppConnectionRepository } from '../ports/whatsapp-connection.repository.port';
import { WhatsAppConnector } from '../ports/whatsapp-connector.port';
import { clientNoShowStatus } from '../shared/client-no-show-status';
import { handoffExpiredBefore } from '../shared/handoff-expiry';

const MS_PER_MINUTE = 60 * 1000;

export interface WaitlistBarbershopFailure {
  barbershopId: string;
  error: unknown;
}

export interface WaitlistSendFailure {
  barbershopId: string;
  offerId: string;
  error: unknown;
}

export interface ProcessWaitlistResult {
  offered: number;
  expiredOffers: number;
  removedEntries: number;
  failures: WaitlistBarbershopFailure[];
  sendFailures: WaitlistSendFailure[];
}

// US-24 (RF-22, RF-23, RN-15 to RN-17) and AD-009: barbershop by barbershop,
// entries whose period ended leave the queue, offers past their deadline
// expire, and each freed slot (a future cancelled appointment, AD-014) without
// a pending offer goes to the first compatible entry that never got it. The
// availability engine decides whether the entry fits the slot, so the minimum
// advance (CA-24.5) and every rule of US-07 hold. The offer is stored before
// it is sent and never sent again.
export class ProcessWaitlistUseCase {
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly connections: WhatsAppConnectionRepository,
    private readonly suspension: GetSuspensionReasonUseCase,
    private readonly waitlist: WaitlistRepository,
    private readonly schedule: ScheduleQuery,
    private readonly listSlots: ListAvailableSlotsUseCase,
    private readonly bookingRules: BookingRulesRepository,
    private readonly ledger: NoShowLedger,
    private readonly conversations: ConversationRepository,
    private readonly clients: ClientRepository,
    private readonly services: ServiceRepository,
    private readonly connector: WhatsAppConnector,
    private readonly metrics: WaitlistMetrics,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly resumeAfterHours: number,
  ) {}

  async execute(): Promise<ProcessWaitlistResult> {
    const now = this.clock.now();
    const result: ProcessWaitlistResult = {
      offered: 0,
      expiredOffers: 0,
      removedEntries: 0,
      failures: [],
      sendFailures: [],
    };
    for (const barbershopId of await this.barbershops.listIds()) {
      try {
        await this.processFor(barbershopId, now, result);
      } catch (error) {
        result.failures.push({ barbershopId, error });
      }
    }
    return result;
  }

  private async processFor(
    barbershopId: string,
    now: Date,
    result: ProcessWaitlistResult,
  ): Promise<void> {
    const barbershop = await this.barbershops.findById(barbershopId);
    if (!barbershop) return;
    const timezone = BarbershopTimezone.create(barbershop.timezone);
    // CA-24.6: the queue is cleaned even while nothing can be offered.
    const entries: WaitlistEntry[] = [];
    for (const entry of await this.waitlist.listEntries(barbershopId)) {
      if (entry.endsAt(timezone) > now) {
        entries.push(entry);
        continue;
      }
      await this.waitlist.removeEntry(barbershopId, entry.id);
      this.metrics.entry('expired');
      result.removedEntries += 1;
    }
    const expired = await this.waitlist.expireOffers(barbershopId, now);
    if (expired > 0) this.metrics.offer('expired', expired);
    result.expiredOffers += expired;

    if (entries.length === 0) return;
    const connection = await this.connections.findByBarbershopId(barbershopId);
    if (connection?.status !== 'connected') return;
    if (await this.suspension.execute(barbershopId)) return;

    const offers = await this.waitlist.listOffers(barbershopId);
    const lastEnd = Math.max(
      ...entries.map((entry) => entry.endsAt(timezone).getTime()),
    );
    const freed = (
      await this.schedule.listStartingIn(
        barbershopId,
        { start: now, end: new Date(lastEnd) },
        null,
      )
    ).filter((entry) => entry.status === 'cancelled' && entry.startsAt > now);
    for (const slot of freed) {
      if (
        offers.some(
          (offer) =>
            offer.status === 'pending' && offer.appointmentId === slot.id,
        )
      ) {
        continue;
      }
      const offer = await this.offerSlot(
        barbershop,
        timezone,
        slot,
        entries,
        offers,
        now,
        result,
      );
      if (offer) offers.push(offer);
    }
  }

  // RN-15: entries are tried in the order they joined.
  private async offerSlot(
    barbershop: Barbershop,
    timezone: BarbershopTimezone,
    slot: ScheduleEntry,
    entries: readonly WaitlistEntry[],
    offers: readonly WaitlistOffer[],
    now: Date,
    result: ProcessWaitlistResult,
  ): Promise<WaitlistOffer | null> {
    for (const entry of entries) {
      const busy = offers.some(
        (offer) =>
          offer.entryId === entry.id &&
          (offer.status === 'pending' || offer.appointmentId === slot.id),
      );
      if (busy) continue;
      if (!(await this.fits(barbershop.id, timezone, entry, slot))) continue;
      if (!(await this.reachable(barbershop.id, entry.clientId, now))) {
        continue;
      }
      const client = await this.clients.findById(barbershop.id, entry.clientId);
      if (!client) continue;

      const rules = await this.rules(barbershop.id);
      const offer: WaitlistOffer = {
        id: this.ids.next(),
        barbershopId: barbershop.id,
        entryId: entry.id,
        appointmentId: slot.id,
        barberId: slot.barber.id,
        startsAt: slot.startsAt,
        expiresAt: new Date(
          now.getTime() + rules.waitlistOfferMinutes * MS_PER_MINUTE,
        ),
        status: 'pending',
      };
      // Another run offered this slot or this entry first.
      if (!(await this.waitlist.createOffer(offer))) return null;
      await this.conversations.saveDraft(barbershop.id, entry.clientId, {
        id: this.ids.next(),
        action: 'book',
        candidates: [],
        targetAppointmentId: null,
        serviceIds: [...entry.serviceIds],
        barberId: entry.barberId,
        anyBarber: entry.barberId === null,
        date: timezone.localDateOf(slot.startsAt),
        period: entry.period,
        time: null,
        offer: [{ barberId: slot.barber.id, startsAt: slot.startsAt }],
        addOnSuggestion: null,
        waitlistProposal: null,
        waitlistOfferId: offer.id,
        updatedAt: now,
      });
      const active = await this.services.listActiveByBarbershop(barbershop.id);
      const services = entry.serviceIds.flatMap((id) => {
        const service = active.find((candidate) => candidate.id === id);
        return service ? [service] : [];
      });
      try {
        await this.connector.sendText(
          barbershop.id,
          client.phone,
          waitlistOfferText(
            timezone,
            services,
            { barberName: slot.barber.name, startsAt: slot.startsAt },
            rules.waitlistOfferMinutes,
          ),
        );
      } catch (error) {
        this.metrics.offer('send_failed');
        result.sendFailures.push({
          barbershopId: barbershop.id,
          offerId: offer.id,
          error,
        });
        return offer;
      }
      this.metrics.offer('sent');
      result.offered += 1;
      return offer;
    }
    return null;
  }

  // AC 10: the barber, dates and period the entry asked for, and a slot the
  // engine lists at exactly the freed start for the entry's services.
  private async fits(
    barbershopId: string,
    timezone: BarbershopTimezone,
    entry: WaitlistEntry,
    slot: ScheduleEntry,
  ): Promise<boolean> {
    if (entry.barberId !== null && entry.barberId !== slot.barber.id) {
      return false;
    }
    if (!entry.covers(timezone, slot.startsAt)) return false;
    try {
      const available = await this.listSlots.execute({
        barbershopId,
        barberId: slot.barber.id,
        serviceIds: entry.serviceIds,
        date: timezone.localDateOf(slot.startsAt),
        origin: 'bot',
      });
      return available.some(
        (candidate) => candidate.startsAt.getTime() === slot.startsAt.getTime(),
      );
    } catch (error) {
      // An inactive service or barber leaves the entry waiting for another slot.
      if (error instanceof DomainError) return false;
      throw error;
    }
  }

  // RN-12: a blocked client cannot book from the bot; RN-23: while a person
  // handles the conversation the bot does not write to the client.
  private async reachable(
    barbershopId: string,
    clientId: string,
    now: Date,
  ): Promise<boolean> {
    const { selfBookingBlocked } = await clientNoShowStatus(
      this.ledger,
      this.bookingRules,
      barbershopId,
      clientId,
    );
    if (selfBookingBlocked) return false;
    return !(await this.conversations.isPaused(
      barbershopId,
      clientId,
      handoffExpiredBefore(now, this.resumeAfterHours),
    ));
  }

  private async rules(barbershopId: string): Promise<BookingRules> {
    return (
      (await this.bookingRules.findByBarbershopId(barbershopId)) ??
      BookingRules.defaults()
    );
  }
}

import { Barbershop } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import { WaitlistEntry } from '../../domain/entities/waitlist-entry';
import {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
} from '../../domain/entities/whatsapp-connection';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { GetSuspensionReasonUseCase } from '../get-suspension-reason/get-suspension-reason.use-case';
import { WaitlistOffer } from '../ports/waitlist.repository.port';
import { ProcessWaitlistUseCase } from '../process-waitlist/process-waitlist.use-case';
import { FakeWhatsAppConnector } from './fake-whatsapp-connector';
import { InMemorySubscriptionRepository } from './in-memory-subscription.repository';
import { InMemoryWhatsAppConnectionRepository } from './in-memory-whatsapp-connection.repository';
import { subscriptionOf } from './subscription-fixtures';
import {
  BOOKING_NOW,
  local,
  setupWhatsAppBooking,
  TOMORROW,
} from './whatsapp-booking-fixtures';

export const ANA_PHONE = '+5511911110001';
export const BRUNO_PHONE = '+5511911110002';
/** The freed slot of the scenario: Corte with João, Wednesday 30/09 15:00. */
export const FREED_AT = local(TOMORROW, '15:00');
const MINUTE_MS = 60 * 1000;

// US-24 scenario on top of the US-17 one: Ana (joined first) and Bruno are
// clients of barbershop A with a connected WhatsApp, and the waitlist job
// runs on the same repositories as the bot.
export async function setupWaitlist({
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
    waitlist,
    waitlistMetrics,
    schedule,
    listSlots,
    own,
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
  for (const client of [scenario.client, ana, bruno]) {
    await conversations.enter(barbershop.id, client.id, now, new Date(0));
  }

  const connections = new InMemoryWhatsAppConnectionRepository();
  const connect = (status: WhatsAppConnectionStatus): Promise<void> =>
    connections.save(
      WhatsAppConnection.restore({
        barbershopId: barbershop.id,
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
  const connector = new FakeWhatsAppConnector();
  const process = new ProcessWaitlistUseCase(
    barbershops,
    connections,
    new GetSuspensionReasonUseCase(subscriptions, clock, 5),
    waitlist,
    schedule,
    listSlots,
    bookingRules,
    ledger,
    conversations,
    clients,
    services,
    connector,
    waitlistMetrics,
    ids,
    clock,
    12,
  );

  let joined = 0;
  // Each entry joins one minute after the previous, so the order is explicit.
  const enlist = async (
    clientId: string,
    overrides: Partial<{
      serviceIds: string[];
      barberId: string | null;
      startsOn: string;
      endsOn: string;
      period: 'morning' | 'afternoon' | 'evening' | null;
      createdAt: Date;
    }> = {},
  ): Promise<WaitlistEntry> => {
    joined += 1;
    const entry = WaitlistEntry.create({
      id: `entry-${clientId}`,
      barbershopId: barbershop.id,
      clientId,
      serviceIds: ['corte'],
      barberId: null,
      startsOn: TOMORROW,
      endsOn: TOMORROW,
      period: 'afternoon',
      createdAt: new Date(now.getTime() - (100 - joined) * MINUTE_MS),
      ...overrides,
    });
    await waitlist.join(entry);
    return entry;
  };
  const free = (
    id = 'freed',
    startsAt = FREED_AT,
    barberId = 'joao',
  ): Promise<void> => own({ id, startsAt, barberId, status: 'cancelled' });
  const offersOf = (clientId: string): WaitlistOffer[] =>
    waitlist.offers.filter((offer) => offer.entryId === `entry-${clientId}`);
  const offerMinutes = (minutes: number): void => {
    const defaults = BookingRules.defaults();
    store.bookingRules.set(
      barbershop.id,
      BookingRules.create({
        minimumAdvanceMinutes: 60,
        cancellationDeadlineMinutes: defaults.cancellationDeadlineMinutes,
        noShowLimit: defaults.noShowLimit,
        waitlistOfferMinutes: minutes,
        returnReminderDays: defaults.returnReminderDays,
      }),
    );
  };
  // A barbershop listed before A whose waitlist cannot be read (AD-009).
  const addFailingBarbershop = (): void => {
    store.barbershops.unshift(
      Barbershop.restore({
        id: 'barbershop-0',
        name: 'Barbearia Zero',
        address: null,
        timezone: BarbershopTimezone.create('America/Sao_Paulo'),
        openingHours: barbershop.openingHours,
        subscriptionStatus: 'trialing',
        trialEndsAt: now,
        createdAt: now,
      }),
    );
    waitlist.failingBarbershops.add('barbershop-0');
  };

  return {
    ...scenario,
    ana,
    bruno,
    connections,
    connect,
    subscriptions,
    suspend,
    connector,
    process,
    enlist,
    free,
    offersOf,
    offerMinutes,
    addFailingBarbershop,
  };
}

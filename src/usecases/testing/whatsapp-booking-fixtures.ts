import {
  Appointment,
  AppointmentStatus,
} from '../../domain/entities/appointment';
import { Barbershop } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { BookAppointmentUseCase } from '../book-appointment/book-appointment.use-case';
import { BookViaWhatsAppUseCase } from '../book-via-whatsapp/book-via-whatsapp.use-case';
import { ConfirmPresenceViaWhatsAppUseCase } from '../confirm-presence-via-whatsapp/confirm-presence-via-whatsapp.use-case';
import { ListAvailableSlotsUseCase } from '../list-available-slots/list-available-slots.use-case';
import { AppointmentBackedScheduleQuery } from './appointment-backed-schedule.query';
import {
  day,
  seedBarber,
  seedBarbershop,
  workingHoursInput,
} from './barber-fixtures';
import { CountingAppointmentMetrics } from './counting-appointment-metrics';
import { CountingWaitlistMetrics } from './counting-waitlist-metrics';
import { InMemoryAccountStore } from './in-memory-account-store';
import { InMemoryAppointmentRepository } from './in-memory-appointment.repository';
import { InMemoryBarberBlockRepository } from './in-memory-barber-block.repository';
import { InMemoryBarberRepository } from './in-memory-barber.repository';
import { InMemoryBarbershopRepository } from './in-memory-barbershop.repository';
import { InMemoryBookingRulesRepository } from './in-memory-booking-rules.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryConversationRepository } from './in-memory-conversation.repository';
import { InMemoryNoShowLedger } from './in-memory-no-show-ledger';
import { InMemoryServiceRepository } from './in-memory-service.repository';
import { InMemoryWaitlistRepository } from './in-memory-waitlist.repository';
import { rulesWithMinimumAdvance } from './scheduling-fixtures';
import { SequentialIdGenerator } from './sequential-id-generator';
import { seedService } from './service-fixtures';
import { SettableClock } from './settable-clock';

/** Tuesday, 29/09, 12:00 in America/Sao_Paulo. */
export const BOOKING_NOW = new Date('2026-09-29T15:00:00.000Z');
export const TOMORROW = '2026-09-30';
export const CLIENT_PHONE = '+5511987654321';

/** Wall-clock time in America/Sao_Paulo (UTC-3) on the given local date. */
export const local = (date: string, time: string): Date =>
  new Date(`${date}T${time}:00-03:00`);

const WORKING_WEEK = workingHoursInput({
  monday: day('09:00', '19:00'),
  tuesday: day('09:00', '19:00'),
  wednesday: day('09:00', '19:00'),
  thursday: day('09:00', '19:00'),
  friday: day('09:00', '19:00'),
  saturday: day('09:00', '19:00'),
});

// US-17 scenario: "Barbearia do Zé", open Monday to Saturday 09:00-19:00;
// Corte (30 min, R$ 45,00), Barba (20 min, R$ 30,00) and Pigmentação, which no
// barber performs; João (Corte, Barba) and Pedro (Corte); minimum advance of
// 60 min; client Carlos Souza without no-shows.
export async function setupWhatsAppBooking({
  address = 'Rua das Flores, 123',
  now = BOOKING_NOW,
}: { address?: string | null; now?: Date } = {}) {
  const store = new InMemoryAccountStore();
  const hours = ['09:00', '19:00'] as [string, string];
  const seeded = seedBarbershop(store, 'barbershop-a', {
    monday: hours,
    tuesday: hours,
    wednesday: hours,
    thursday: hours,
    friday: hours,
    saturday: hours,
  });
  const barbershop = Barbershop.restore({
    id: seeded.id,
    name: 'Barbearia do Zé',
    address,
    timezone: BarbershopTimezone.create('America/Sao_Paulo'),
    openingHours: seeded.openingHours,
    subscriptionStatus: 'trialing',
    trialEndsAt: now,
    createdAt: now,
  });
  store.barbershops.splice(0, store.barbershops.length, barbershop);
  store.bookingRules.set(barbershop.id, rulesWithMinimumAdvance(60));

  const services = new InMemoryServiceRepository();
  await seedService(services, {
    id: 'corte',
    name: 'Corte',
    priceCents: 4500,
    durationMinutes: 30,
  });
  await seedService(services, {
    id: 'barba',
    name: 'Barba',
    priceCents: 3000,
    durationMinutes: 20,
  });
  await seedService(services, {
    id: 'pigmentacao',
    name: 'Pigmentação',
    priceCents: 8000,
    durationMinutes: 40,
  });
  await seedService(services, {
    id: 'hidratacao',
    name: 'Hidratação',
    active: false,
  });

  const barbers = new InMemoryBarberRepository();
  const joao = await seedBarber(barbers, {
    id: 'joao',
    name: 'João',
    serviceIds: ['corte', 'barba'],
    workingHours: WORKING_WEEK,
  });
  const pedro = await seedBarber(barbers, {
    id: 'pedro',
    name: 'Pedro',
    serviceIds: ['corte'],
    workingHours: WORKING_WEEK,
  });
  await seedBarber(barbers, {
    id: 'lucas',
    name: 'Lucas',
    active: false,
    serviceIds: ['corte'],
    workingHours: WORKING_WEEK,
  });
  await seedBarber(barbers, {
    id: 'marcos',
    name: 'Marcos',
    barbershopId: 'barbershop-b',
    serviceIds: ['corte'],
    workingHours: WORKING_WEEK,
  });

  const clients = new InMemoryClientRepository();
  const client = Client.create({
    id: 'carlos',
    barbershopId: barbershop.id,
    name: 'Carlos Souza',
    phone: PhoneNumber.create(CLIENT_PHONE),
    now,
  });
  clients.add(client);

  const clock = new SettableClock(now);
  const barbershops = new InMemoryBarbershopRepository(store);
  const bookingRules = new InMemoryBookingRulesRepository(store);
  const appointments = new InMemoryAppointmentRepository(clients);
  const blocks = new InMemoryBarberBlockRepository(barbers);
  const ledger = new InMemoryNoShowLedger(appointments);
  const conversations = new InMemoryConversationRepository();
  const ids = new SequentialIdGenerator();
  const appointmentMetrics = new CountingAppointmentMetrics();
  const waitlist = new InMemoryWaitlistRepository();
  const waitlistMetrics = new CountingWaitlistMetrics();
  const listSlots = new ListAvailableSlotsUseCase(
    barbershops,
    bookingRules,
    barbers,
    services,
    appointments,
    blocks,
    clock,
  );
  const book = new BookAppointmentUseCase(
    barbershops,
    bookingRules,
    barbers,
    services,
    appointments,
    blocks,
    clock,
    ids,
    appointmentMetrics,
  );
  const schedule = new AppointmentBackedScheduleQuery(
    appointments,
    barbers,
    services,
    clients,
  );
  const booking = new BookViaWhatsAppUseCase(
    barbers,
    bookingRules,
    ledger,
    conversations,
    listSlots,
    book,
    ids,
    schedule,
    appointments,
    appointmentMetrics,
    waitlist,
    waitlistMetrics,
  );
  const presence = new ConfirmPresenceViaWhatsAppUseCase(
    schedule,
    appointments,
  );

  const busy = (barberId: string, start: Date, end: Date): void =>
    appointments.seed({ barbershopId: barbershop.id, barberId, start, end });
  const block = (barberId: string, start: Date, end: Date): void =>
    blocks.seed({ barbershopId: barbershop.id, barberId, start, end });
  // RN-11: no-shows are counted from past appointments of the client.
  const noShows = async (count: number): Promise<void> => {
    for (let index = 0; index < count; index += 1) {
      const startsAt = local(`2026-09-0${index + 1}`, '10:00');
      await appointments.create(
        Appointment.restore({
          id: `no-show-${index + 1}`,
          barbershopId: barbershop.id,
          barberId: pedro.id,
          clientId: client.id,
          serviceIds: ['corte'],
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
          status: 'no_show',
          origin: 'manual',
          createdAt: startsAt,
        }),
      );
    }
  };
  // US-18: an appointment of a client, stored as the panel or the bot would.
  const own = async ({
    id,
    startsAt,
    serviceIds = ['corte'],
    barberId = joao.id,
    clientId = client.id,
    barbershopId = barbershop.id,
    status = 'confirmed',
  }: {
    id: string;
    startsAt: Date;
    serviceIds?: string[];
    barberId?: string;
    clientId?: string;
    barbershopId?: string;
    status?: AppointmentStatus;
  }): Promise<void> => {
    const minutes = serviceIds.length * 30;
    await appointments.create(
      Appointment.restore({
        id,
        barbershopId,
        barberId,
        clientId,
        serviceIds,
        startsAt,
        endsAt: new Date(startsAt.getTime() + minutes * 60 * 1000),
        status,
        origin: 'manual',
        createdAt: BOOKING_NOW,
      }),
    );
  };
  const statusOf = async (id: string): Promise<AppointmentStatus | null> =>
    (await appointments.findById(barbershop.id, id))?.status ?? null;
  const bookedBy = async (clientId: string): Promise<Appointment[]> =>
    (await appointments.list(barbershop.id)).filter(
      (appointment) => appointment.clientId === clientId,
    );

  return {
    store,
    barbershop,
    barbershops,
    bookingRules,
    services,
    barbers,
    joao,
    pedro,
    clients,
    client,
    clock,
    appointments,
    blocks,
    ledger,
    conversations,
    ids,
    appointmentMetrics,
    waitlist,
    waitlistMetrics,
    schedule,
    listSlots,
    booking,
    presence,
    busy,
    block,
    noShows,
    own,
    statusOf,
    bookedBy,
  };
}

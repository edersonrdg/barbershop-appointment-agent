import { BookingRules } from '../../domain/value-objects/booking-rules';
import { seedBarbershop } from './barber-fixtures';
import { FixedClock } from './fixed-clock';
import { InMemoryAccountStore } from './in-memory-account-store';
import { InMemoryAppointmentRepository } from './in-memory-appointment.repository';
import { InMemoryBarberBlockRepository } from './in-memory-barber-block.repository';
import { InMemoryBarberRepository } from './in-memory-barber.repository';
import { InMemoryBarbershopRepository } from './in-memory-barbershop.repository';
import { InMemoryBookingRulesRepository } from './in-memory-booking-rules.repository';
import { InMemoryServiceRepository } from './in-memory-service.repository';
import { seedService } from './service-fixtures';

// 2026-10-05 is a monday and 2026-10-06 a tuesday.
export const MONDAY = '2026-10-05';
export const TUESDAY = '2026-10-06';

/** Wall-clock time in America/Sao_Paulo (UTC-3) on the given local date. */
export const at = (time: string, date = MONDAY): Date =>
  new Date(`${date}T${time}:00-03:00`);

export function rulesWithMinimumAdvance(minutes: number): BookingRules {
  const defaults = BookingRules.defaults();
  return BookingRules.create({
    minimumAdvanceMinutes: minutes,
    cancellationDeadlineMinutes: defaults.cancellationDeadlineMinutes,
    noShowLimit: defaults.noShowLimit,
    waitlistOfferMinutes: defaults.waitlistOfferMinutes,
    returnReminderDays: defaults.returnReminderDays,
  });
}

// Barbearia A: segunda 09:00-18:00 com intervalo 12:00-13:00, terça
// 09:00-18:00, antecedência mínima de 60 min. Barbearia B: segunda 09:00-18:00.
// Serviços: corte (30 min), barba (15 min), pézinho inativo e um corte da B.
export async function setupScheduling(now: Date) {
  const store = new InMemoryAccountStore();
  const barbershopA = seedBarbershop(store, 'barbershop-a', {
    monday: ['09:00', '18:00', ['12:00', '13:00']],
    tuesday: ['09:00', '18:00'],
  });
  seedBarbershop(store, 'barbershop-b', { monday: ['09:00', '18:00'] });
  store.bookingRules.set('barbershop-a', rulesWithMinimumAdvance(60));
  const services = new InMemoryServiceRepository();
  await seedService(services, {
    id: 'haircut',
    name: 'Corte',
    durationMinutes: 30,
  });
  await seedService(services, {
    id: 'beard',
    name: 'Barba',
    durationMinutes: 15,
  });
  await seedService(services, { id: 'old', name: 'Pézinho', active: false });
  await seedService(services, {
    id: 'foreign',
    name: 'Corte',
    barbershopId: 'barbershop-b',
  });
  return {
    store,
    barbershopA,
    barbershops: new InMemoryBarbershopRepository(store),
    bookingRules: new InMemoryBookingRulesRepository(store),
    barbers: new InMemoryBarberRepository(),
    services,
    appointments: new InMemoryAppointmentRepository(),
    blocks: new InMemoryBarberBlockRepository(),
    clock: new FixedClock(now),
  };
}

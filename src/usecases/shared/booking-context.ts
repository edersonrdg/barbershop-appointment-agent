import { AppointmentOrigin } from '../../domain/entities/appointment';
import { Barber } from '../../domain/entities/barber';
import { Barbershop, UtcPeriod } from '../../domain/entities/barbershop';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { InvalidValueError } from '../../domain/errors/invalid-value.error';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { ServiceNotPerformedError } from '../../domain/errors/service-not-performed.error';
import { BarberDaySchedule } from '../../domain/value-objects/barber-day-schedule';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import {
  AppointmentRepository,
  BusyPeriod,
} from '../ports/appointment.repository.port';
import { BarberBlockRepository } from '../ports/barber-block.repository.port';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { Clock } from '../ports/clock.port';
import { ServiceRepository } from '../ports/service.repository.port';

const MS_PER_MINUTE = 60 * 1000;

export const EMPTY_SERVICES_MESSAGE = 'Escolha pelo menos um serviço.';
export const REPEATED_SERVICE_MESSAGE = 'Escolha cada serviço uma única vez.';

export interface SchedulingPorts {
  barbershops: BarbershopRepository;
  bookingRules: BookingRulesRepository;
  barbers: BarberRepository;
  services: ServiceRepository;
  appointments: AppointmentRepository;
  blocks: BarberBlockRepository;
  clock: Clock;
}

export interface BookingContext {
  barbershop: Barbershop;
  timezone: BarbershopTimezone;
  serviceIds: readonly string[];
  durationMinutes: number;
  minimumAdvanceMinutes: number;
  now: Date;
  earliest: Date;
}

export async function loadBookingContext(
  ports: SchedulingPorts,
  {
    barbershopId,
    serviceIds,
    origin,
  }: {
    barbershopId: string;
    serviceIds: readonly string[];
    origin: AppointmentOrigin;
  },
): Promise<BookingContext> {
  assertServiceList(serviceIds);
  const barbershop = await ports.barbershops.findById(barbershopId);
  if (!barbershop) {
    throw new InvalidCredentialsError();
  }
  const durationMinutes = await totalDuration(
    ports.services,
    barbershopId,
    serviceIds,
  );
  // CA-07.3: the rule in force is read on every call (AVL-17); a barbershop
  // inserted outside the app has no rules and uses the defaults (AD-008).
  const rules =
    (await ports.bookingRules.findByBarbershopId(barbershopId)) ??
    BookingRules.defaults();
  const now = ports.clock.now();
  const minimumAdvanceMinutes = rules.minimumAdvanceMinutes;
  // CA-07.3: the minimum advance (RN-02) binds only the bot; the panel may
  // book anything from now on.
  const earliest =
    origin === 'bot'
      ? new Date(now.getTime() + minimumAdvanceMinutes * MS_PER_MINUTE)
      : now;
  return {
    barbershop,
    timezone: BarbershopTimezone.create(barbershop.timezone),
    serviceIds,
    durationMinutes,
    minimumAdvanceMinutes,
    now,
    earliest,
  };
}

export async function loadBookableBarber(
  barbers: BarberRepository,
  barbershopId: string,
  barberId: string,
  serviceIds: readonly string[],
): Promise<Barber> {
  const barber = await barbers.findById(barbershopId, barberId);
  if (!barber || !barber.active) {
    throw new BarberNotFoundError();
  }
  if (!performsAll(barber, serviceIds)) {
    throw new ServiceNotPerformedError();
  }
  return barber;
}

// RN-04: the services of one booking are a single visit with a single barber,
// so only a barber who performs every one of them can take it.
export function performsAll(
  barber: Barber,
  serviceIds: readonly string[],
): boolean {
  return serviceIds.every((serviceId) => barber.serviceIds.includes(serviceId));
}

export async function buildDaySchedules(
  ports: SchedulingPorts,
  context: BookingContext,
  barbers: readonly Barber[],
  localDate: string,
): Promise<BarberDaySchedule[]> {
  const openPeriods = context.barbershop.openIntervalsOn(localDate);
  if (openPeriods.length === 0 || barbers.length === 0) {
    return barbers.map((barber) =>
      scheduleOf(barber, context, localDate, openPeriods, [], []),
    );
  }
  const range = hullOf(openPeriods);
  const barberIds = barbers.map((barber) => barber.id);
  const barbershopId = context.barbershop.id;
  const [appointments, blocks] = await Promise.all([
    ports.appointments.listBusyPeriods(barbershopId, barberIds, range),
    ports.blocks.listBusyPeriods(barbershopId, barberIds, range),
  ]);
  return barbers.map((barber) =>
    scheduleOf(barber, context, localDate, openPeriods, blocks, appointments),
  );
}

function scheduleOf(
  barber: Barber,
  context: BookingContext,
  localDate: string,
  openPeriods: UtcPeriod[],
  blocks: BusyPeriod[],
  appointments: BusyPeriod[],
): BarberDaySchedule {
  const ofBarber = (busy: BusyPeriod[]): UtcPeriod[] =>
    busy
      .filter((period) => period.barberId === barber.id)
      .map(({ start, end }) => ({ start, end }));
  return BarberDaySchedule.create({
    barberId: barber.id,
    openPeriods,
    workPeriods: barber.workIntervalsOn(localDate, context.timezone),
    blocks: ofBarber(blocks),
    appointments: ofBarber(appointments),
  });
}

function hullOf(periods: UtcPeriod[]): UtcPeriod {
  const starts = periods.map((period) => period.start.getTime());
  const ends = periods.map((period) => period.end.getTime());
  return {
    start: new Date(Math.min(...starts)),
    end: new Date(Math.max(...ends)),
  };
}

function assertServiceList(serviceIds: readonly string[]): void {
  if (serviceIds.length === 0) {
    throw new InvalidValueError(EMPTY_SERVICES_MESSAGE);
  }
  if (new Set(serviceIds).size !== serviceIds.length) {
    throw new InvalidValueError(REPEATED_SERVICE_MESSAGE);
  }
}

// RN-04: the duration of a booking is the sum of its services, read at the
// time of the query or the booking.
async function totalDuration(
  services: ServiceRepository,
  barbershopId: string,
  serviceIds: readonly string[],
): Promise<number> {
  const found = await services.findByIds(barbershopId, serviceIds);
  let minutes = 0;
  for (const serviceId of serviceIds) {
    const service = found.find((candidate) => candidate.id === serviceId);
    if (!service || !service.active) {
      throw new ServiceNotFoundError();
    }
    minutes += service.durationMinutes;
  }
  return minutes;
}

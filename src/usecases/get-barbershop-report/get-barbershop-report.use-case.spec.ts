import {
  Appointment,
  AppointmentOrigin,
  AppointmentStatus,
} from '../../domain/entities/appointment';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import {
  day,
  seedBarber,
  seedBarbershop,
  workingHoursInput,
} from '../testing/barber-fixtures';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryAppointmentRepository } from '../testing/in-memory-appointment.repository';
import { InMemoryBarberBlockRepository } from '../testing/in-memory-barber-block.repository';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryReportQuery } from '../testing/in-memory-report.query';
import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import { at, MONDAY, TUESDAY } from '../testing/scheduling-fixtures';
import { seedService } from '../testing/service-fixtures';
import { GetBarbershopReportUseCase } from './get-barbershop-report.use-case';

const SUNDAY = '2026-10-04';
const SHOP = 'barbershop-a';

describe('GetBarbershopReportUseCase', () => {
  let appointments: InMemoryAppointmentRepository;
  let blocks: InMemoryBarberBlockRepository;
  let barbers: InMemoryBarberRepository;
  let useCase: GetBarbershopReportUseCase;
  let sequence: number;

  async function book({
    barberId = 'ana',
    barbershopId = SHOP,
    start,
    end,
    status = 'confirmed',
    origin = 'manual',
    serviceIds = ['haircut'],
  }: {
    barberId?: string;
    barbershopId?: string;
    start: Date;
    end: Date;
    status?: AppointmentStatus;
    origin?: AppointmentOrigin;
    serviceIds?: string[];
  }): Promise<void> {
    sequence += 1;
    await appointments.create(
      Appointment.restore({
        id: `appointment-${sequence}`,
        barbershopId,
        barberId,
        clientId: null,
        serviceIds,
        startsAt: start,
        endsAt: end,
        status,
        origin,
        createdAt: start,
      }),
    );
  }

  const report = (input: { from?: string; to?: string; barberId?: string }) =>
    useCase.execute({
      barbershopId: SHOP,
      from: input.from ?? MONDAY,
      to: input.to ?? MONDAY,
      ...(input.barberId !== undefined && { barberId: input.barberId }),
    });

  beforeEach(async () => {
    sequence = 0;
    const store = new InMemoryAccountStore();
    seedBarbershop(store, SHOP, {
      monday: ['09:00', '18:00'],
      tuesday: ['09:00', '18:00'],
    });
    seedBarbershop(store, 'barbershop-b', { monday: ['09:00', '18:00'] });
    const services = new InMemoryServiceRepository();
    await seedService(services, {
      id: 'haircut',
      name: 'Corte',
      priceCents: 4000,
    });
    barbers = new InMemoryBarberRepository();
    await seedBarber(barbers, {
      id: 'ana',
      name: 'Ana',
      workingHours: workingHoursInput({
        monday: day('09:00', '12:00'),
        tuesday: day('09:00', '12:00'),
      }),
    });
    await seedBarber(barbers, {
      id: 'foreign',
      name: 'Carla',
      barbershopId: 'barbershop-b',
    });
    appointments = new InMemoryAppointmentRepository();
    blocks = new InMemoryBarberBlockRepository(barbers);
    useCase = new GetBarbershopReportUseCase(
      new InMemoryBarbershopRepository(store),
      barbers,
      appointments,
      blocks,
      new InMemoryReportQuery(appointments, services),
    );
  });

  it('CA-26.1 (C1): counts every status of the appointments starting from `from` 00:00 to the end of `to`, local time', async () => {
    await book({ start: at('00:00'), end: at('00:30') });
    await book({ start: at('09:00'), end: at('09:30'), status: 'attended' });
    await book({ start: at('09:30'), end: at('10:00'), status: 'no_show' });
    await book({ start: at('10:00'), end: at('10:30'), status: 'cancelled' });
    await book({ start: at('23:59', SUNDAY), end: at('00:00') });
    await book({ start: at('00:00', TUESDAY), end: at('00:30', TUESDAY) });

    const result = await report({});

    expect(result.totalAppointments).toBe(4);
    expect(result.from).toBe(MONDAY);
    expect(result.to).toBe(MONDAY);
    expect(result.barberId).toBeNull();
  });

  it('CA-26.1 (C2): counts the cancelled appointments, including the old one of a reschedule', async () => {
    await book({ start: at('09:00'), end: at('09:30'), status: 'cancelled' });
    await book({
      start: at('09:00'),
      end: at('09:30'),
      status: 'cancelled',
      origin: 'bot',
    });
    await book({ start: at('10:00'), end: at('10:30'), origin: 'bot' });

    const result = await report({});

    expect(result.cancellations).toBe(2);
  });

  describe('occupancy', () => {
    it('CA-26.1 (C5): booked minutes of confirmed, attended and no-show over the available minutes', async () => {
      await book({ start: at('09:00'), end: at('09:30'), status: 'attended' });
      await book({ start: at('09:30'), end: at('10:00'), status: 'no_show' });
      await book({ start: at('10:00'), end: at('10:30') });
      await book({
        start: at('10:30'),
        end: at('11:00'),
        status: 'cancelled',
      });

      expect((await report({})).occupancyPercent).toBe(50);
    });

    it('CA-26.1 (C5): a block reduces the available minutes', async () => {
      blocks.seed({
        barbershopId: SHOP,
        barberId: 'ana',
        start: at('09:00'),
        end: at('10:00'),
      });
      await book({ start: at('10:00'), end: at('10:30') });
      await book({ start: at('10:30'), end: at('11:00') });
      await book({ start: at('11:00'), end: at('11:30') });

      expect((await report({})).occupancyPercent).toBe(75);
    });

    it('CA-26.1 (C5): only the part of an appointment inside the working hours counts', async () => {
      await book({ start: at('11:30'), end: at('12:30') });

      expect((await report({})).occupancyPercent).toBe(16.7);
    });

    it('CA-26.1 (C5): an inactive barber stays out of the occupancy', async () => {
      await seedBarber(barbers, {
        id: 'bruno',
        name: 'Bruno',
        active: false,
        workingHours: workingHoursInput({ monday: day('09:00', '12:00') }),
      });
      await book({ start: at('09:00'), end: at('10:30') });
      await book({ barberId: 'bruno', start: at('09:00'), end: at('12:00') });

      const result = await report({});

      expect(result.occupancyPercent).toBe(50);
      expect(result.totalAppointments).toBe(2);
    });

    it('CA-26.1 (C5): rounds to one decimal place', async () => {
      await book({ start: at('09:00'), end: at('10:00') });
      expect((await report({})).occupancyPercent).toBe(33.3);

      await book({ start: at('10:00'), end: at('11:00') });
      expect((await report({})).occupancyPercent).toBe(66.7);
    });

    it('CA-26.1 (C5): the working hours count only inside the opening hours, every day of the period', async () => {
      await seedBarber(barbers, {
        id: 'bruno',
        name: 'Bruno',
        workingHours: workingHoursInput({ monday: day('08:00', '12:00') }),
      });
      await book({ barberId: 'bruno', start: at('09:00'), end: at('12:00') });

      // Ana 180 + 180 min, Bruno 180 min (08:00 is before the opening).
      const result = await report({ from: MONDAY, to: TUESDAY });

      expect(result.occupancyPercent).toBe(33.3);
    });

    it('CA-26.1 (C6): is null for a period with no available minutes', async () => {
      expect(
        (await report({ from: SUNDAY, to: SUNDAY })).occupancyPercent,
      ).toBeNull();
    });

    it('CA-26.1 (C6): is null for an inactive barber, with the rest of the numbers', async () => {
      await seedBarber(barbers, {
        id: 'bruno',
        name: 'Bruno',
        active: false,
        workingHours: workingHoursInput({ monday: day('09:00', '12:00') }),
      });
      await book({ barberId: 'bruno', start: at('09:00'), end: at('10:00') });

      const result = await report({ barberId: 'bruno' });

      expect(result.occupancyPercent).toBeNull();
      expect(result.totalAppointments).toBe(1);
    });
  });

  it('CA-26.1 (C7): with barberId, every number is of that barber only', async () => {
    await seedBarber(barbers, {
      id: 'bruno',
      name: 'Bruno',
      workingHours: workingHoursInput({ monday: day('09:00', '18:00') }),
    });
    blocks.seed({
      barbershopId: SHOP,
      barberId: 'bruno',
      start: at('13:00'),
      end: at('18:00'),
    });
    await book({ start: at('09:00'), end: at('10:30'), status: 'attended' });
    await book({ start: at('11:00'), end: at('11:30'), status: 'cancelled' });
    await book({
      barberId: 'bruno',
      start: at('09:00'),
      end: at('09:30'),
      status: 'no_show',
      origin: 'bot',
    });

    const ana = await report({ barberId: 'ana' });
    const all = await report({});

    expect(ana).toEqual({
      from: MONDAY,
      to: MONDAY,
      barberId: 'ana',
      totalAppointments: 2,
      cancellations: 1,
      noShows: 0,
      occupancyPercent: 50,
      estimatedRevenueCents: 4000,
      botBookedPercent: 0,
    });
    expect(all).toEqual({
      from: MONDAY,
      to: MONDAY,
      barberId: null,
      totalAppointments: 3,
      cancellations: 1,
      noShows: 1,
      // Ana 90 of 180 min, Bruno 30 of 240 min.
      occupancyPercent: 28.6,
      estimatedRevenueCents: 4000,
      botBookedPercent: 33.3,
    });
  });

  it('CA-26.1 (C13): rejects a barber that is not of the barbershop', async () => {
    await expect(report({ barberId: 'missing' })).rejects.toThrow(
      BarberNotFoundError,
    );
    await expect(report({ barberId: 'foreign' })).rejects.toThrow(
      BarberNotFoundError,
    );
  });

  it('CA-26.2 (C14): the share of appointments booked by the bot', async () => {
    await book({ start: at('09:00'), end: at('09:30'), origin: 'bot' });
    await book({ start: at('09:30'), end: at('10:00'), origin: 'bot' });
    await book({
      start: at('10:00'),
      end: at('10:30'),
      origin: 'bot',
      status: 'cancelled',
    });
    await book({ start: at('10:30'), end: at('11:00') });
    expect((await report({})).botBookedPercent).toBe(75);
  });

  it('CA-26.2 (C14): rounds the bot share to one decimal place', async () => {
    await book({ start: at('09:00'), end: at('09:30'), origin: 'bot' });
    await book({ start: at('09:30'), end: at('10:00') });
    await book({ start: at('10:00'), end: at('10:30') });

    expect((await report({})).botBookedPercent).toBe(33.3);
  });

  it('CA-26.2 (C15): a period with no appointments has zeros and no bot share', async () => {
    expect(await report({})).toEqual({
      from: MONDAY,
      to: MONDAY,
      barberId: null,
      totalAppointments: 0,
      cancellations: 0,
      noShows: 0,
      occupancyPercent: 0,
      estimatedRevenueCents: 0,
      botBookedPercent: null,
    });
  });
});

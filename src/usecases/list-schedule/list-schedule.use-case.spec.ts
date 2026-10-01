import { BookingRules } from '../../domain/value-objects/booking-rules';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { seedBarber, seedBarbershop } from '../testing/barber-fixtures';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryBookingRulesRepository } from '../testing/in-memory-booking-rules.repository';
import { InMemoryScheduleQuery } from '../testing/in-memory-schedule.query';
import { at, MONDAY } from '../testing/scheduling-fixtures';
import { SettableClock } from '../testing/settable-clock';
import { ListScheduleUseCase } from './list-schedule.use-case';

// 2026-10-05 is a monday; 2026-10-07 is the wednesday of the same week.
const WEDNESDAY = '2026-10-07';

async function setup() {
  const store = new InMemoryAccountStore();
  seedBarbershop(store, 'barbershop-a');
  seedBarbershop(store, 'barbershop-b');
  const barbers = new InMemoryBarberRepository();
  const ana = { id: 'barber-ana', name: 'Ana' };
  const bruno = { id: 'barber-bruno', name: 'Bruno' };
  const caio = { id: 'barber-caio', name: 'Caio' };
  const foreign = { id: 'barber-foreign', name: 'Davi' };
  await seedBarber(barbers, { ...ana, userId: 'user-ana' });
  await seedBarber(barbers, { ...bruno, userId: 'user-bruno' });
  await seedBarber(barbers, { ...caio, active: false });
  await seedBarber(barbers, { ...foreign, barbershopId: 'barbershop-b' });
  const schedule = new InMemoryScheduleQuery();
  schedule.seed('barbershop-a', {
    id: 'ana-monday',
    barber: ana,
    startsAt: at('10:00'),
  });
  schedule.seed('barbershop-a', {
    id: 'bruno-monday',
    barber: bruno,
    startsAt: at('11:00'),
  });
  schedule.seed('barbershop-a', {
    id: 'caio-monday',
    barber: caio,
    startsAt: at('14:00'),
  });
  schedule.seed('barbershop-a', {
    id: 'ana-wednesday',
    barber: ana,
    startsAt: at('09:00', WEDNESDAY),
  });
  schedule.seed('barbershop-b', {
    id: 'foreign-monday',
    barber: foreign,
    startsAt: at('10:00'),
  });
  const clock = new SettableClock(new Date('2026-10-05T12:00:00.000Z'));
  const useCase = new ListScheduleUseCase(
    new InMemoryBarbershopRepository(store),
    barbers,
    schedule,
    new InMemoryBookingRulesRepository(store),
    clock,
  );
  return { useCase, schedule, store, clock, ana };
}

const owner = {
  barbershopId: 'barbershop-a',
  userId: 'owner',
  role: 'owner',
} as const;
const brunoUser = {
  barbershopId: 'barbershop-a',
  userId: 'user-bruno',
  role: 'barber',
} as const;

describe('ListScheduleUseCase', () => {
  describe('CA-08.1: the owner sees every barber', () => {
    it('CA-08.1: day view returns the appointments of all barbers starting that local day', async () => {
      const { useCase, schedule } = await setup();

      const result = await useCase.execute({
        ...owner,
        view: 'day',
        date: MONDAY,
      });

      expect(result.entries.map((entry) => entry.id)).toEqual([
        'ana-monday',
        'bruno-monday',
        'caio-monday',
      ]);
      expect(schedule.calls).toEqual([
        {
          barbershopId: 'barbershop-a',
          range: {
            start: new Date('2026-10-05T03:00:00.000Z'),
            end: new Date('2026-10-06T03:00:00.000Z'),
          },
          barberId: null,
        },
      ]);
    });

    it('CA-08.1: week view returns Monday to Sunday of the week of the date', async () => {
      const { useCase, schedule } = await setup();

      const result = await useCase.execute({
        ...owner,
        view: 'week',
        date: WEDNESDAY,
      });

      expect(result.entries.map((entry) => entry.id)).toEqual([
        'ana-monday',
        'bruno-monday',
        'caio-monday',
        'ana-wednesday',
      ]);
      expect(schedule.calls[0].range).toEqual({
        start: new Date('2026-10-05T03:00:00.000Z'),
        end: new Date('2026-10-12T03:00:00.000Z'),
      });
    });

    it('CA-08.1: returns the period and the barbershop timezone', async () => {
      const { useCase } = await setup();

      const result = await useCase.execute({
        ...owner,
        view: 'week',
        date: WEDNESDAY,
      });

      expect(result.period.view).toBe('week');
      expect(result.period.startDate).toBe('2026-10-05');
      expect(result.period.endDate).toBe('2026-10-11');
      expect(result.timezone).toBe('America/Sao_Paulo');
    });

    it('CA-08.1: filters by one barber of the barbershop', async () => {
      const { useCase, schedule } = await setup();

      const result = await useCase.execute({
        ...owner,
        view: 'day',
        date: MONDAY,
        barberId: 'barber-bruno',
      });

      expect(result.entries.map((entry) => entry.id)).toEqual(['bruno-monday']);
      expect(schedule.calls[0].barberId).toBe('barber-bruno');
    });

    it('CA-08.1: filters by an inactive barber too', async () => {
      const { useCase } = await setup();

      const result = await useCase.execute({
        ...owner,
        view: 'day',
        date: MONDAY,
        barberId: 'barber-caio',
      });

      expect(result.entries.map((entry) => entry.id)).toEqual(['caio-monday']);
    });

    it('CA-08.1: rejects an unknown barber with "Barbeiro não encontrado." without reading the schedule', async () => {
      const { useCase, schedule } = await setup();

      await expect(
        useCase.execute({
          ...owner,
          view: 'day',
          date: MONDAY,
          barberId: '00000000-0000-4000-8000-000000000000',
        }),
      ).rejects.toThrow(new BarberNotFoundError());
      expect(schedule.calls).toEqual([]);
    });
  });

  describe('CA-08.2: a barber sees only their own appointments', () => {
    it('CA-08.2: without a barber filter returns only the barber linked to the user', async () => {
      const { useCase, schedule } = await setup();

      const result = await useCase.execute({
        ...brunoUser,
        view: 'week',
        date: MONDAY,
      });

      expect(result.entries.map((entry) => entry.id)).toEqual(['bruno-monday']);
      expect(schedule.calls[0].barberId).toBe('barber-bruno');
    });

    it('CA-08.2: with their own barber id returns the same appointments', async () => {
      const { useCase } = await setup();

      const result = await useCase.execute({
        ...brunoUser,
        view: 'week',
        date: MONDAY,
        barberId: 'barber-bruno',
      });

      expect(result.entries.map((entry) => entry.id)).toEqual(['bruno-monday']);
    });

    it('CA-08.2: rejects the id of another barber with "Acesso negado." without reading the schedule', async () => {
      const { useCase, schedule } = await setup();

      await expect(
        useCase.execute({
          ...brunoUser,
          view: 'week',
          date: MONDAY,
          barberId: 'barber-ana',
        }),
      ).rejects.toThrow(new ScheduleAccessDeniedError());
      expect(new ScheduleAccessDeniedError().message).toBe('Acesso negado.');
      expect(schedule.calls).toEqual([]);
    });

    it('CA-08.2: a barber user without a barber record gets an empty schedule', async () => {
      const { useCase, schedule } = await setup();

      const result = await useCase.execute({
        barbershopId: 'barbershop-a',
        userId: 'user-without-barber',
        role: 'barber',
        view: 'day',
        date: MONDAY,
      });

      expect(result.entries).toEqual([]);
      expect(result.period.startDate).toBe(MONDAY);
      expect(schedule.calls).toEqual([]);
    });

    it('CA-08.2: a barber user without a barber record asking for a barber is denied', async () => {
      const { useCase } = await setup();

      await expect(
        useCase.execute({
          barbershopId: 'barbershop-a',
          userId: 'user-without-barber',
          role: 'barber',
          view: 'day',
          date: MONDAY,
          barberId: 'barber-ana',
        }),
      ).rejects.toThrow(new ScheduleAccessDeniedError());
    });
  });

  describe('RN-26: tenant isolation', () => {
    it('RN-26: reads only the barbershop of the session', async () => {
      const { useCase, schedule } = await setup();

      const result = await useCase.execute({
        barbershopId: 'barbershop-b',
        userId: 'owner-b',
        role: 'owner',
        view: 'day',
        date: MONDAY,
      });

      expect(result.entries.map((entry) => entry.id)).toEqual([
        'foreign-monday',
      ]);
      expect(schedule.calls[0].barbershopId).toBe('barbershop-b');
    });

    it('RN-26: rejects a barber of another barbershop with "Barbeiro não encontrado."', async () => {
      const { useCase, schedule } = await setup();

      await expect(
        useCase.execute({
          ...owner,
          view: 'day',
          date: MONDAY,
          barberId: 'barber-foreign',
        }),
      ).rejects.toThrow(new BarberNotFoundError());
      expect(schedule.calls).toEqual([]);
    });

    it('RN-26: a barber of another barbershop linked to the same user id is not the own barber', async () => {
      const { useCase } = await setup();

      await expect(
        useCase.execute({
          barbershopId: 'barbershop-b',
          userId: 'user-bruno',
          role: 'barber',
          view: 'day',
          date: MONDAY,
          barberId: 'barber-bruno',
        }),
      ).rejects.toThrow(new ScheduleAccessDeniedError());
    });
  });

  describe('US-19 unconfirmed alert', () => {
    // X starts at 11:00 local on Wednesday; its 24h reminder went out.
    const X_STARTS = new Date('2026-10-07T14:00:00.000Z');

    it.each([
      [60, false],
      [120, true],
    ])(
      'CA-19.5, AC 21 (C29): 90 min before, with a cancellation deadline of %i min, unconfirmed is %s',
      async (deadline, expected) => {
        const { useCase, schedule, store, clock, ana } = await setup();
        const defaults = BookingRules.defaults();
        store.bookingRules.set(
          'barbershop-a',
          BookingRules.create({
            minimumAdvanceMinutes: defaults.minimumAdvanceMinutes,
            cancellationDeadlineMinutes: deadline,
            noShowLimit: defaults.noShowLimit,
            waitlistOfferMinutes: defaults.waitlistOfferMinutes,
            returnReminderDays: defaults.returnReminderDays,
          }),
        );
        schedule.seed('barbershop-a', {
          id: 'x',
          barber: ana,
          startsAt: X_STARTS,
          reminder24hSentAt: new Date('2026-10-06T14:00:00.000Z'),
        });
        clock.current = new Date('2026-10-07T12:30:00.000Z');

        const result = await useCase.execute({
          ...owner,
          view: 'day',
          date: WEDNESDAY,
        });

        expect(
          result.entries.find((entry) => entry.id === 'x')?.unconfirmed,
        ).toBe(expected);
      },
    );
  });
});

import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { BarberAccessPolicy } from '../shared/barber-access-policy';
import { seedBarber, seedBarbershop } from '../testing/barber-fixtures';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarberBlockRepository } from '../testing/in-memory-barber-block.repository';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryScheduleQuery } from '../testing/in-memory-schedule.query';
import { at } from '../testing/scheduling-fixtures';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import { BarberBlockConflictError } from './barber-block-conflict.error';
import { CreateBarberBlockUseCase } from './create-barber-block.use-case';

// 2026-10-01 is a thursday; America/Sao_Paulo is UTC-3.
const DATE = '2026-10-01';
const NOW = new Date('2026-09-28T12:00:00.000Z');
const ana = { id: 'barber-ana', name: 'Ana' };
const bruno = { id: 'barber-bruno', name: 'Bruno' };

async function setup() {
  const store = new InMemoryAccountStore();
  seedBarbershop(store, 'barbershop-a');
  seedBarbershop(store, 'barbershop-b');
  const barbers = new InMemoryBarberRepository();
  await seedBarber(barbers, { ...ana, userId: 'user-ana' });
  await seedBarber(barbers, { ...bruno, userId: 'user-bruno' });
  await seedBarber(barbers, {
    id: 'barber-foreign',
    name: 'Davi',
    barbershopId: 'barbershop-b',
  });
  const schedule = new InMemoryScheduleQuery();
  // Ana has a 30-minute appointment at 10:00 on the date.
  schedule.seed('barbershop-a', {
    id: 'ana-appointment',
    barber: ana,
    startsAt: at('10:00', DATE),
  });
  const blocks = new InMemoryBarberBlockRepository(barbers);
  const useCase = new CreateBarberBlockUseCase(
    new InMemoryBarbershopRepository(store),
    new BarberAccessPolicy(barbers),
    schedule,
    blocks,
    new FixedClock(NOW),
    new SequentialIdGenerator(),
  );
  const savedBlocks = () =>
    blocks.listStartingIn(
      'barbershop-a',
      {
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2027-01-01T00:00:00.000Z'),
      },
      null,
    );
  return { useCase, schedule, blocks, savedBlocks };
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
const lunch = {
  kind: 'block',
  date: DATE,
  start: '12:00',
  end: '13:00',
} as const;

describe('CreateBarberBlockUseCase', () => {
  describe('CA-09.1: blocking a period', () => {
    it('CA-09.1: a barber blocks their own schedule and the block is saved in UTC', async () => {
      const { useCase, blocks } = await setup();

      const result = await useCase.execute({
        ...brunoUser,
        ...lunch,
        barberId: 'barber-bruno',
        reason: '  Almoço  ',
      });

      expect(result).toEqual({
        block: {
          id: 'id-1',
          barber: { id: 'barber-bruno', name: 'Bruno' },
          kind: 'block',
          startsAt: new Date('2026-10-01T15:00:00.000Z'),
          endsAt: new Date('2026-10-01T16:00:00.000Z'),
          reason: 'Almoço',
        },
        affectedAppointments: [],
      });
      const saved = await blocks.findById('barbershop-a', 'id-1');
      expect(saved?.barbershopId).toBe('barbershop-a');
      expect(saved?.barberId).toBe('barber-bruno');
      expect(saved?.kind).toBe('block');
      expect(saved?.startsAt).toEqual(new Date('2026-10-01T15:00:00.000Z'));
      expect(saved?.endsAt).toEqual(new Date('2026-10-01T16:00:00.000Z'));
      expect(saved?.reason).toBe('Almoço');
      expect(saved?.createdAt).toEqual(NOW);
    });

    it('CA-09.1: the reason is optional and saved as null', async () => {
      const { useCase, blocks } = await setup();

      const result = await useCase.execute({
        ...brunoUser,
        ...lunch,
        barberId: 'barber-bruno',
      });

      expect(result.block.reason).toBeNull();
      expect(
        (await blocks.findById('barbershop-a', 'id-1'))?.reason,
      ).toBeNull();
    });

    it('CA-09.1: the owner blocks the schedule of any barber of the barbershop', async () => {
      const { useCase, blocks } = await setup();

      const result = await useCase.execute({
        ...owner,
        ...lunch,
        barberId: 'barber-ana',
      });

      expect(result.block.barber).toEqual({ id: 'barber-ana', name: 'Ana' });
      expect(result.block.startsAt).toEqual(
        new Date('2026-10-01T15:00:00.000Z'),
      );
      expect(result.block.endsAt).toEqual(new Date('2026-10-01T16:00:00.000Z'));
      expect((await blocks.findById('barbershop-a', 'id-1'))?.barberId).toBe(
        'barber-ana',
      );
    });

    it('section 5: a barber blocking another barber gets "Acesso negado." and nothing is saved', async () => {
      const { useCase, savedBlocks } = await setup();

      await expect(
        useCase.execute({ ...brunoUser, ...lunch, barberId: 'barber-ana' }),
      ).rejects.toThrow(new ScheduleAccessDeniedError());
      expect(await savedBlocks()).toEqual([]);
    });

    it('section 5: a barber user without a barber record gets "Acesso negado." and nothing is saved', async () => {
      const { useCase, savedBlocks } = await setup();

      await expect(
        useCase.execute({
          barbershopId: 'barbershop-a',
          userId: 'user-without-barber',
          role: 'barber',
          ...lunch,
          barberId: 'barber-ana',
        }),
      ).rejects.toThrow(new ScheduleAccessDeniedError());
      expect(await savedBlocks()).toEqual([]);
    });

    it('RN-26: an unknown or foreign barber gets "Barbeiro não encontrado." and nothing is saved', async () => {
      const { useCase, savedBlocks, schedule } = await setup();

      await expect(
        useCase.execute({ ...owner, ...lunch, barberId: 'barber-foreign' }),
      ).rejects.toThrow(new BarberNotFoundError());
      await expect(
        useCase.execute({ ...owner, ...lunch, barberId: 'barber-unknown' }),
      ).rejects.toThrow(new BarberNotFoundError());
      expect(await savedBlocks()).toEqual([]);
      expect(schedule.overlappingCalls).toEqual([]);
    });
  });

  describe('CA-09.2: registering a day off', () => {
    it('CA-09.2: the owner registers a day off covering the whole local day', async () => {
      const { useCase, blocks } = await setup();

      const result = await useCase.execute({
        ...owner,
        kind: 'day_off',
        date: DATE,
        barberId: 'barber-bruno',
      });

      expect(result.block).toEqual({
        id: 'id-1',
        barber: { id: 'barber-bruno', name: 'Bruno' },
        kind: 'day_off',
        startsAt: new Date('2026-10-01T03:00:00.000Z'),
        endsAt: new Date('2026-10-02T03:00:00.000Z'),
        reason: null,
      });
      expect(result.affectedAppointments).toEqual([]);
      const saved = await blocks.findById('barbershop-a', 'id-1');
      expect(saved?.kind).toBe('day_off');
      expect(saved?.startsAt).toEqual(new Date('2026-10-01T03:00:00.000Z'));
      expect(saved?.endsAt).toEqual(new Date('2026-10-02T03:00:00.000Z'));
    });

    it('CA-09.2: a barber registers a day off on their own schedule', async () => {
      const { useCase, blocks } = await setup();

      const result = await useCase.execute({
        ...brunoUser,
        kind: 'day_off',
        date: DATE,
        barberId: 'barber-bruno',
      });

      expect(result.block.kind).toBe('day_off');
      expect(result.block.startsAt).toEqual(
        new Date('2026-10-01T03:00:00.000Z'),
      );
      expect(result.block.endsAt).toEqual(new Date('2026-10-02T03:00:00.000Z'));
      expect((await blocks.findById('barbershop-a', 'id-1'))?.barberId).toBe(
        'barber-bruno',
      );
    });
  });

  describe('CA-09.3: conflicts with existing appointments', () => {
    const overlapping = {
      ...owner,
      kind: 'block',
      date: DATE,
      start: '10:15',
      end: '11:00',
      barberId: 'barber-ana',
    } as const;

    it('CA-09.3: without confirmation it throws the conflict with the appointments and saves nothing', async () => {
      const { useCase, savedBlocks } = await setup();

      const error = await useCase.execute(overlapping).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BarberBlockConflictError);
      const conflict = error as BarberBlockConflictError;
      expect(conflict.message).toBe(
        'O bloqueio conflita com agendamentos existentes.',
      );
      expect(conflict.appointments).toEqual([
        {
          id: 'ana-appointment',
          barber: { id: 'barber-ana', name: 'Ana' },
          client: null,
          services: [{ id: 'haircut', name: 'Corte' }],
          startsAt: new Date('2026-10-01T13:00:00.000Z'),
          endsAt: new Date('2026-10-01T13:30:00.000Z'),
          status: 'confirmed',
          origin: 'manual',
        },
      ]);
      expect(await savedBlocks()).toEqual([]);
    });

    it('CA-09.3: a day off reaching an appointment also needs confirmation', async () => {
      const { useCase, savedBlocks } = await setup();

      await expect(
        useCase.execute({
          ...owner,
          kind: 'day_off',
          date: DATE,
          barberId: 'barber-ana',
          confirmConflicts: false,
        }),
      ).rejects.toThrow(BarberBlockConflictError);
      expect(await savedBlocks()).toEqual([]);
    });

    it('CA-09.3: with confirmation it saves the block and returns the affected appointments untouched', async () => {
      const { useCase, blocks, schedule } = await setup();

      const result = await useCase.execute({
        ...overlapping,
        confirmConflicts: true,
      });

      expect(result.block.startsAt).toEqual(
        new Date('2026-10-01T13:15:00.000Z'),
      );
      expect(result.block.endsAt).toEqual(new Date('2026-10-01T14:00:00.000Z'));
      expect(result.affectedAppointments.map((entry) => entry.id)).toEqual([
        'ana-appointment',
      ]);
      expect(result.affectedAppointments[0].status).toBe('confirmed');
      expect((await blocks.findById('barbershop-a', 'id-1'))?.barberId).toBe(
        'barber-ana',
      );
      const [appointment] = await schedule.listStartingIn(
        'barbershop-a',
        {
          start: new Date('2026-10-01T03:00:00.000Z'),
          end: new Date('2026-10-02T03:00:00.000Z'),
        },
        'barber-ana',
      );
      expect(appointment.status).toBe('confirmed');
      expect(appointment.startsAt).toEqual(
        new Date('2026-10-01T13:00:00.000Z'),
      );
      expect(appointment.endsAt).toEqual(new Date('2026-10-01T13:30:00.000Z'));
    });

    it('CA-09.3: checks conflicts for the barber and the UTC period of the block', async () => {
      const { useCase, schedule } = await setup();

      await useCase.execute({ ...owner, ...lunch, barberId: 'barber-ana' });

      expect(schedule.overlappingCalls).toEqual([
        {
          barbershopId: 'barbershop-a',
          barberId: 'barber-ana',
          range: {
            start: new Date('2026-10-01T15:00:00.000Z'),
            end: new Date('2026-10-01T16:00:00.000Z'),
          },
        },
      ]);
    });

    it('CA-09.3: a block that only touches an appointment has no conflict', async () => {
      const { useCase, blocks } = await setup();

      const result = await useCase.execute({
        ...owner,
        kind: 'block',
        date: DATE,
        start: '10:30',
        end: '11:00',
        barberId: 'barber-ana',
      });

      expect(result.affectedAppointments).toEqual([]);
      expect((await blocks.findById('barbershop-a', 'id-1'))?.barberId).toBe(
        'barber-ana',
      );
    });

    it('CA-09.3: confirming without a conflict saves with an empty list', async () => {
      const { useCase, blocks } = await setup();

      const result = await useCase.execute({
        ...owner,
        ...lunch,
        barberId: 'barber-ana',
        confirmConflicts: true,
      });

      expect(result.affectedAppointments).toEqual([]);
      expect((await blocks.findById('barbershop-a', 'id-1'))?.kind).toBe(
        'block',
      );
    });
  });
});

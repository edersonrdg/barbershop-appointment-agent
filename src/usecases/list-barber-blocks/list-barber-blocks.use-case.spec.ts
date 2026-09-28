import {
  BarberBlock,
  BarberBlockKind,
} from '../../domain/entities/barber-block';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { BarberAccessPolicy } from '../shared/barber-access-policy';
import { seedBarber, seedBarbershop } from '../testing/barber-fixtures';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarberBlockRepository } from '../testing/in-memory-barber-block.repository';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { at, MONDAY, TUESDAY } from '../testing/scheduling-fixtures';
import { ListBarberBlocksUseCase } from './list-barber-blocks.use-case';

// 2026-10-05 is a monday; 2026-10-12 is the monday of the next week.
const NEXT_MONDAY = '2026-10-12';

async function setup() {
  const store = new InMemoryAccountStore();
  seedBarbershop(store, 'barbershop-a');
  seedBarbershop(store, 'barbershop-b');
  const barbers = new InMemoryBarberRepository();
  await seedBarber(barbers, {
    id: 'barber-ana',
    name: 'Ana',
    userId: 'user-ana',
  });
  await seedBarber(barbers, {
    id: 'barber-bruno',
    name: 'bruno',
    userId: 'user-bruno',
  });
  await seedBarber(barbers, {
    id: 'barber-foreign',
    name: 'Davi',
    barbershopId: 'barbershop-b',
  });
  const blocks = new InMemoryBarberBlockRepository(barbers);
  const seed = (
    id: string,
    barberId: string,
    kind: BarberBlockKind,
    start: Date,
    end: Date,
    barbershopId = 'barbershop-a',
  ) =>
    blocks.create(
      BarberBlock.create({
        id,
        barbershopId,
        barberId,
        kind,
        period: { start, end },
        reason: kind === 'block' ? 'Almoço' : null,
        now: start,
      }),
    );
  await seed('bruno-lunch', 'barber-bruno', 'block', at('12:00'), at('13:00'));
  await seed('ana-lunch', 'barber-ana', 'block', at('12:00'), at('13:00'));
  await seed(
    'ana-day-off',
    'barber-ana',
    'day_off',
    at('00:00', TUESDAY),
    at('00:00', '2026-10-07'),
  );
  await seed(
    'ana-next-week',
    'barber-ana',
    'block',
    at('12:00', NEXT_MONDAY),
    at('13:00', NEXT_MONDAY),
  );
  await seed(
    'foreign-lunch',
    'barber-foreign',
    'block',
    at('12:00'),
    at('13:00'),
    'barbershop-b',
  );
  const listStartingIn = jest.spyOn(blocks, 'listStartingIn');
  const useCase = new ListBarberBlocksUseCase(
    new InMemoryBarbershopRepository(store),
    new BarberAccessPolicy(barbers),
    blocks,
  );
  return { useCase, listStartingIn };
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

describe('ListBarberBlocksUseCase', () => {
  it('RF-26: the owner lists every block and day off starting in the week, ordered by start and barber name', async () => {
    const { useCase, listStartingIn } = await setup();

    const result = await useCase.execute({
      ...owner,
      view: 'week',
      date: TUESDAY,
    });

    expect(result.blocks).toEqual([
      {
        id: 'ana-lunch',
        barber: { id: 'barber-ana', name: 'Ana' },
        kind: 'block',
        startsAt: new Date('2026-10-05T15:00:00.000Z'),
        endsAt: new Date('2026-10-05T16:00:00.000Z'),
        reason: 'Almoço',
      },
      {
        id: 'bruno-lunch',
        barber: { id: 'barber-bruno', name: 'bruno' },
        kind: 'block',
        startsAt: new Date('2026-10-05T15:00:00.000Z'),
        endsAt: new Date('2026-10-05T16:00:00.000Z'),
        reason: 'Almoço',
      },
      {
        id: 'ana-day-off',
        barber: { id: 'barber-ana', name: 'Ana' },
        kind: 'day_off',
        startsAt: new Date('2026-10-06T03:00:00.000Z'),
        endsAt: new Date('2026-10-07T03:00:00.000Z'),
        reason: null,
      },
    ]);
    expect(listStartingIn).toHaveBeenCalledWith(
      'barbershop-a',
      {
        start: new Date('2026-10-05T03:00:00.000Z'),
        end: new Date('2026-10-12T03:00:00.000Z'),
      },
      null,
    );
  });

  it('RF-26: returns the period with local dates and the barbershop timezone', async () => {
    const { useCase } = await setup();

    const result = await useCase.execute({
      ...owner,
      view: 'week',
      date: TUESDAY,
    });

    expect(result.period.view).toBe('week');
    expect(result.period.startDate).toBe(MONDAY);
    expect(result.period.endDate).toBe('2026-10-11');
    expect(result.timezone).toBe('America/Sao_Paulo');
  });

  it('RF-26: the owner filters by one barber and by day', async () => {
    const { useCase, listStartingIn } = await setup();

    const result = await useCase.execute({
      ...owner,
      view: 'day',
      date: MONDAY,
      barberId: 'barber-ana',
    });

    expect(result.blocks.map((block) => block.id)).toEqual(['ana-lunch']);
    expect(listStartingIn).toHaveBeenCalledWith(
      'barbershop-a',
      {
        start: new Date('2026-10-05T03:00:00.000Z'),
        end: new Date('2026-10-06T03:00:00.000Z'),
      },
      'barber-ana',
    );
  });

  it('RN-26: the owner filtering by a barber of another barbershop gets "Barbeiro não encontrado."', async () => {
    const { useCase, listStartingIn } = await setup();

    await expect(
      useCase.execute({
        ...owner,
        view: 'week',
        date: MONDAY,
        barberId: 'barber-foreign',
      }),
    ).rejects.toThrow(new BarberNotFoundError());
    expect(listStartingIn).not.toHaveBeenCalled();
  });

  it('section 5: a barber lists only their own blocks', async () => {
    const { useCase, listStartingIn } = await setup();

    const result = await useCase.execute({
      ...brunoUser,
      view: 'week',
      date: MONDAY,
    });

    expect(result.blocks.map((block) => block.id)).toEqual(['bruno-lunch']);
    expect(listStartingIn).toHaveBeenCalledWith(
      'barbershop-a',
      expect.anything(),
      'barber-bruno',
    );
  });

  it('section 5: a barber asking for another barber gets "Acesso negado."', async () => {
    const { useCase, listStartingIn } = await setup();

    await expect(
      useCase.execute({
        ...brunoUser,
        view: 'week',
        date: MONDAY,
        barberId: 'barber-ana',
      }),
    ).rejects.toThrow(new ScheduleAccessDeniedError());
    expect(listStartingIn).not.toHaveBeenCalled();
  });

  it('section 5: a barber user without a barber record gets an empty list without reading', async () => {
    const { useCase, listStartingIn } = await setup();

    const result = await useCase.execute({
      barbershopId: 'barbershop-a',
      userId: 'user-without-barber',
      role: 'barber',
      view: 'week',
      date: MONDAY,
    });

    expect(result.blocks).toEqual([]);
    expect(result.period.startDate).toBe(MONDAY);
    expect(listStartingIn).not.toHaveBeenCalled();
  });

  it('RN-26: reads only the barbershop of the session', async () => {
    const { useCase, listStartingIn } = await setup();

    const result = await useCase.execute({
      barbershopId: 'barbershop-b',
      userId: 'owner-b',
      role: 'owner',
      view: 'day',
      date: MONDAY,
    });

    expect(result.blocks.map((block) => block.id)).toEqual(['foreign-lunch']);
    expect(listStartingIn).toHaveBeenCalledWith(
      'barbershop-b',
      expect.anything(),
      null,
    );
  });
});

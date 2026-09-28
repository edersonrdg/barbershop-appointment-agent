import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { DomainError } from '../../domain/errors/domain.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { ServiceNotPerformedError } from '../../domain/errors/service-not-performed.error';
import { ListAvailableSlotsUseCase } from '../list-available-slots/list-available-slots.use-case';
import { BarberAccessPolicy } from '../shared/barber-access-policy';
import { day, seedBarber, workingHoursInput } from '../testing/barber-fixtures';
import { at, MONDAY, setupScheduling } from '../testing/scheduling-fixtures';
import { seedService } from '../testing/service-fixtures';
import {
  ListPanelSlotsInput,
  ListPanelSlotsUseCase,
} from './list-panel-slots.use-case';

// Sunday before MONDAY: nothing on MONDAY is in the past.
const SUNDAY_NOON = new Date('2026-10-04T12:00:00.000Z');
const SUNDAY = '2026-10-04';

// Barbearia A abre 09:00-18:00 com intervalo 12:00-13:00 na segunda e exige
// 60 min de antecedência. Ana (user-ana) trabalha 10:00-17:00, faz corte (30)
// e barba (15), tem um agendamento 14:00-14:45 e um bloqueio 15:30-16:00.
// Bruno (user-bruno) faz corte e barba 09:00-18:00. Caio só faz corte. Bia
// está inativa. Ninguém faz o serviço "Navalhado".
async function setup(now = SUNDAY_NOON) {
  const env = await setupScheduling(now);
  await seedBarber(env.barbers, {
    id: 'ana',
    name: 'Ana',
    userId: 'user-ana',
    serviceIds: ['haircut', 'beard'],
    workingHours: workingHoursInput({ monday: day('10:00', '17:00') }),
  });
  await seedBarber(env.barbers, {
    id: 'bruno',
    name: 'Bruno',
    userId: 'user-bruno',
    serviceIds: ['haircut', 'beard'],
  });
  await seedBarber(env.barbers, {
    id: 'caio',
    name: 'Caio',
    serviceIds: ['haircut'],
  });
  await seedBarber(env.barbers, {
    id: 'bia',
    name: 'Bia',
    active: false,
    serviceIds: ['haircut', 'beard'],
  });
  await seedBarber(env.barbers, {
    id: 'zeca',
    name: 'Zeca',
    barbershopId: 'barbershop-b',
    serviceIds: ['foreign'],
  });
  await seedService(env.services, {
    id: 'shave',
    name: 'Navalhado',
    durationMinutes: 30,
  });
  env.appointments.seed({
    barbershopId: 'barbershop-a',
    barberId: 'ana',
    start: at('14:00'),
    end: at('14:45'),
  });
  env.blocks.seed({
    barbershopId: 'barbershop-a',
    barberId: 'ana',
    start: at('15:30'),
    end: at('16:00'),
  });
  const listSlots = new ListAvailableSlotsUseCase(
    env.barbershops,
    env.bookingRules,
    env.barbers,
    env.services,
    env.appointments,
    env.blocks,
    env.clock,
  );
  const useCase = new ListPanelSlotsUseCase(
    env.barbershops,
    new BarberAccessPolicy(env.barbers),
    listSlots,
    env.barbers,
  );
  return { useCase };
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

function input(
  overrides: Partial<ListPanelSlotsInput> = {},
): ListPanelSlotsInput {
  return { ...owner, date: MONDAY, serviceIds: ['haircut'], ...overrides };
}

const slot = (
  barber: { id: string; name: string },
  time: string,
  minutes: number,
) => ({
  barber,
  startsAt: at(time),
  endsAt: new Date(at(time).getTime() + minutes * 60 * 1000),
});
const ana = { id: 'ana', name: 'Ana' };
const bruno = { id: 'bruno', name: 'Bruno' };

describe('ListPanelSlotsUseCase', () => {
  describe('CA-10.1: the owner lists free starts', () => {
    it('CA-10.1: with a barber, returns that barber free starts with name, date and timezone (AGM-20)', async () => {
      const { useCase } = await setup();

      const result = await useCase.execute(input({ barberId: 'ana' }));

      expect(result).toEqual({
        date: MONDAY,
        timezone: 'America/Sao_Paulo',
        slots: [
          '10:00',
          '10:30',
          '11:00',
          '11:30',
          '13:00',
          '13:30',
          '14:45',
          '16:00',
          '16:30',
        ].map((time) => slot(ana, time, 30)),
      });
    });

    it('CA-10.1: without a barber, each start comes once with the first free barber by name among those doing every service (AGM-21)', async () => {
      const { useCase } = await setup();

      const result = await useCase.execute(
        input({ serviceIds: ['haircut', 'beard'] }),
      );

      expect(result.slots).toEqual(
        (
          [
            [bruno, '09:00'],
            [bruno, '09:30'],
            [ana, '10:00'],
            [ana, '10:30'],
            [ana, '11:00'],
            [ana, '13:00'],
            [bruno, '13:30'],
            [bruno, '14:00'],
            [bruno, '14:30'],
            [ana, '14:45'],
            [bruno, '15:00'],
            [bruno, '15:30'],
            [ana, '16:00'],
            [bruno, '16:30'],
            [bruno, '17:00'],
          ] as const
        ).map(([barber, time]) => slot(barber, time, 45)),
      );
    });

    it('CA-10.1: a closed day has no slots', async () => {
      const { useCase } = await setup();

      const result = await useCase.execute(input({ date: SUNDAY }));

      expect(result).toEqual({
        date: SUNDAY,
        timezone: 'America/Sao_Paulo',
        slots: [],
      });
    });

    it('CA-10.1: without a barber, no active barber doing every service means no slots', async () => {
      const { useCase } = await setup();

      const result = await useCase.execute(input({ serviceIds: ['shave'] }));

      expect(result.slots).toEqual([]);
    });
  });

  describe('CA-10.3: no minimum advance on the panel', () => {
    it('CA-10.3: with a 60-minute minimum advance, the first start is the next one from now (AGM-22)', async () => {
      const { useCase } = await setup(at('10:05'));

      const result = await useCase.execute(input({ barberId: 'ana' }));

      expect(result.slots[0]).toEqual(slot(ana, '10:30', 30));
    });
  });

  describe('CA-10.5: a barber lists only their own starts', () => {
    it.each([
      ['without a barber', undefined],
      ['with their own barber', 'bruno'],
    ])(
      'CA-10.5: a barber %s gets only their own starts (AGM-23)',
      async (_, barberId) => {
        const { useCase } = await setup();

        const result = await useCase.execute(
          input({ ...brunoUser, barberId, serviceIds: ['haircut', 'beard'] }),
        );

        expect(result.slots.map((found) => found.startsAt)).toEqual(
          [
            '09:00',
            '09:30',
            '10:00',
            '10:30',
            '11:00',
            '13:00',
            '13:30',
            '14:00',
            '14:30',
            '15:00',
            '15:30',
            '16:00',
            '16:30',
            '17:00',
          ].map((time) => at(time)),
        );
        expect(new Set(result.slots.map((found) => found.barber.id))).toEqual(
          new Set(['bruno']),
        );
      },
    );

    it.each([
      ['for another barber', 'user-bruno', 'ana'],
      ['without a barber record', 'user-nobody', undefined],
    ])(
      'CA-10.5: a barber listing %s is denied (AGM-23)',
      async (_, userId, barberId) => {
        const { useCase } = await setup();
        const attempt = useCase.execute(
          input({
            barbershopId: 'barbershop-a',
            userId,
            role: 'barber',
            barberId,
          }),
        );

        await expect(attempt).rejects.toBeInstanceOf(ScheduleAccessDeniedError);
        await expect(attempt).rejects.toThrow('Acesso negado.');
      },
    );
  });

  describe('AGM-26: barber and services are checked by the engine', () => {
    it.each<
      [
        string,
        Partial<ListPanelSlotsInput>,
        new (...args: never[]) => DomainError,
        string,
      ]
    >([
      [
        'missing barber',
        { barberId: 'ghost' },
        BarberNotFoundError,
        'Barbeiro não encontrado.',
      ],
      [
        'inactive barber',
        { barberId: 'bia' },
        BarberNotFoundError,
        'Barbeiro não encontrado.',
      ],
      [
        'barber of another barbershop (RN-26)',
        { barberId: 'zeca' },
        BarberNotFoundError,
        'Barbeiro não encontrado.',
      ],
      [
        'missing service',
        { barberId: 'ana', serviceIds: ['haircut', 'ghost'] },
        ServiceNotFoundError,
        'Serviço não encontrado.',
      ],
      [
        'service of another barbershop (RN-26)',
        { serviceIds: ['foreign'] },
        ServiceNotFoundError,
        'Serviço não encontrado.',
      ],
      [
        'barber without every service',
        { barberId: 'caio', serviceIds: ['haircut', 'beard'] },
        ServiceNotPerformedError,
        'O barbeiro não realiza todos os serviços escolhidos.',
      ],
    ])(
      'AGM-26: a %s is refused by the engine',
      async (_, overrides, errorType, message) => {
        const { useCase } = await setup();
        const attempt = useCase.execute(input(overrides));

        await expect(attempt).rejects.toBeInstanceOf(errorType);
        await expect(attempt).rejects.toThrow(message);
      },
    );
  });
});

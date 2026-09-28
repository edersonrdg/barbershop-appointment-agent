import { BarberNameAlreadyExistsError } from '../../domain/errors/barber-name-already-exists.error';
import { BarberUserAlreadyLinkedError } from '../../domain/errors/barber-user-already-linked.error';
import { InvalidBarberServiceError } from '../../domain/errors/invalid-barber-service.error';
import { InvalidBarberUserError } from '../../domain/errors/invalid-barber-user.error';
import { InvalidWorkingHoursError } from '../../domain/errors/invalid-working-hours.error';
import {
  BarberState,
  day,
  describeBarber,
  seedBarber,
  seedBarbershop,
  seedUser,
  workingHoursInput,
} from '../testing/barber-fixtures';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import { seedService } from '../testing/service-fixtures';
import {
  CreateBarberInput,
  CreateBarberUseCase,
} from './create-barber.use-case';

const NOW = new Date('2026-09-28T09:00:00.000Z');

const WEEKDAYS_9_TO_18 = workingHoursInput({
  monday: day('09:00', '18:00', ['12:00', '13:00']),
  tuesday: day('09:00', '18:00'),
});

async function setup() {
  const store = new InMemoryAccountStore();
  // Barbearia A: segunda e terça 09:00-18:00, intervalo 12:00-13:00 na segunda.
  seedBarbershop(store, 'barbershop-a', {
    monday: ['09:00', '18:00', ['12:00', '13:00']],
    tuesday: ['09:00', '18:00'],
  });
  seedBarbershop(store, 'barbershop-b', { monday: ['09:00', '18:00'] });
  seedUser(store, 'owner-a', 'owner');
  seedUser(store, 'barber-a', 'barber');
  seedUser(store, 'barber-b', 'barber', 'barbershop-b');
  const services = new InMemoryServiceRepository();
  await seedService(services, { id: 'haircut', name: 'Corte' });
  await seedService(services, { id: 'beard', name: 'Barba' });
  await seedService(services, { id: 'old', name: 'Pézinho', active: false });
  await seedService(services, {
    id: 'foreign',
    name: 'Corte',
    barbershopId: 'barbershop-b',
  });
  const barbers = new InMemoryBarberRepository();
  const useCase = new CreateBarberUseCase(
    barbers,
    services,
    new InMemoryUserRepository(store),
    new InMemoryBarbershopRepository(store),
    new FixedClock(NOW),
    new SequentialIdGenerator(),
  );
  return { barbers, useCase };
}

function input(overrides: Partial<CreateBarberInput> = {}): CreateBarberInput {
  return {
    barbershopId: 'barbershop-a',
    name: 'João',
    userId: null,
    serviceIds: ['haircut'],
    workingHours: WEEKDAYS_9_TO_18,
    ...overrides,
  };
}

async function allStates(
  barbers: InMemoryBarberRepository,
): Promise<BarberState[]> {
  const a = await barbers.listByBarbershop('barbershop-a');
  const b = await barbers.listByBarbershop('barbershop-b');
  return [...a, ...b].map(describeBarber);
}

describe('CreateBarberUseCase', () => {
  it('CA-05.1: creates an active barber with services and working hours and returns it as saved', async () => {
    const { barbers, useCase } = await setup();

    const { barber } = await useCase.execute(
      input({ serviceIds: ['beard', 'haircut'], userId: 'barber-a' }),
    );

    const expected: BarberState = {
      id: 'id-1',
      barbershopId: 'barbershop-a',
      name: 'João',
      active: true,
      userId: 'barber-a',
      serviceIds: ['beard', 'haircut'],
      workingHours: WEEKDAYS_9_TO_18,
    };
    expect(describeBarber(barber)).toEqual(expected);
    const stored = await barbers.findById('barbershop-a', 'id-1');
    expect(stored && describeBarber(stored)).toEqual(expected);
    expect(stored?.createdAt).toEqual(NOW);
  });

  describe('CA-05.3: warnings against the opening hours', () => {
    it('returns no warning when the working hours are inside the opening hours', async () => {
      const { useCase } = await setup();

      const { warnings } = await useCase.execute(input());

      expect(warnings).toEqual([]);
    });

    it('saves the barber and warns about a partial day and a closed day', async () => {
      const { barbers, useCase } = await setup();

      const { warnings } = await useCase.execute(
        input({
          workingHours: workingHoursInput({
            monday: day('08:00', '18:00'),
            sunday: day('09:00', '13:00'),
          }),
        }),
      );

      expect(warnings).toEqual([
        {
          weekday: 'monday',
          message:
            'Segunda-feira: só o trecho da jornada dentro do horário de funcionamento estará disponível.',
        },
        {
          weekday: 'sunday',
          message:
            'Domingo: a barbearia não abre neste dia, então a jornada não estará disponível.',
        },
      ]);
      expect(
        describeBarber((await barbers.findById('barbershop-a', 'id-1'))!)
          .workingHours.sunday,
      ).toEqual({ startsAt: '09:00', endsAt: '13:00', break: null });
    });

    it('compares with the opening hours of the barber barbershop', async () => {
      const { useCase } = await setup();

      const { warnings } = await useCase.execute(
        input({
          barbershopId: 'barbershop-b',
          serviceIds: ['foreign'],
          workingHours: workingHoursInput({ tuesday: day('09:00', '18:00') }),
        }),
      );

      expect(warnings.map((warning) => warning.weekday)).toEqual(['tuesday']);
    });

    it('returns no warning when every day is off', async () => {
      const { useCase } = await setup();

      const { warnings } = await useCase.execute(
        input({ workingHours: workingHoursInput() }),
      );

      expect(warnings).toEqual([]);
    });
  });

  describe('CA-05.2: link with a panel user', () => {
    it.each([
      ['a barber', 'barber-a'],
      ['the owner', 'owner-a'],
    ])('links %s of the barbershop', async (_case, userId) => {
      const { useCase } = await setup();

      const { barber } = await useCase.execute(input({ userId }));

      expect(barber.userId).toBe(userId);
    });

    it('creates without link when userId is null', async () => {
      const { useCase } = await setup();

      const { barber } = await useCase.execute(input({ userId: null }));

      expect(barber.userId).toBeNull();
    });
  });

  describe('rejections persist nothing', () => {
    async function expectRejected(
      overrides: Partial<CreateBarberInput>,
      errorType: new (...args: never[]) => Error,
      message: string,
      seed?: (barbers: InMemoryBarberRepository) => Promise<unknown>,
    ) {
      const { barbers, useCase } = await setup();
      if (seed) await seed(barbers);
      const before = await allStates(barbers);

      const attempt = useCase.execute(input(overrides));

      await expect(attempt).rejects.toBeInstanceOf(errorType);
      await expect(attempt).rejects.toThrow(message);
      expect(await allStates(barbers)).toEqual(before);
    }

    it('CA-05.1: a name taken in another case throws BarberNameAlreadyExistsError', async () => {
      await expectRejected(
        { name: 'JOÃO' },
        BarberNameAlreadyExistsError,
        'Já existe um barbeiro com esse nome.',
        (barbers) => seedBarber(barbers, { id: 'joao', name: 'João' }),
      );
    });

    it('CA-05.1: the name of an inactive barber is also taken', async () => {
      await expectRejected(
        { name: 'joão' },
        BarberNameAlreadyExistsError,
        'Já existe um barbeiro com esse nome.',
        (barbers) =>
          seedBarber(barbers, { id: 'joao', name: 'João', active: false }),
      );
    });

    it.each([
      ['an unknown service', ['haircut', 'missing'], 'Serviço não encontrado.'],
      [
        'a service of another barbershop',
        ['foreign'],
        'Serviço não encontrado.',
      ],
      [
        'an inactive service',
        ['haircut', 'old'],
        'Os serviços realizados devem estar ativos.',
      ],
    ])(
      'CA-05.1: %s throws InvalidBarberServiceError',
      async (_case, serviceIds, message) => {
        await expectRejected(
          { serviceIds },
          InvalidBarberServiceError,
          message,
        );
      },
    );

    it.each([
      ['an unknown user', 'missing'],
      ['a user of another barbershop', 'barber-b'],
    ])('CA-05.2: %s throws InvalidBarberUserError', async (_case, userId) => {
      await expectRejected(
        { userId },
        InvalidBarberUserError,
        'Usuário não encontrado.',
      );
    });

    it('CA-05.2: a user linked to another barber throws BarberUserAlreadyLinkedError', async () => {
      await expectRejected(
        { userId: 'barber-a' },
        BarberUserAlreadyLinkedError,
        'Esse usuário já está vinculado a outro barbeiro.',
        (barbers) =>
          seedBarber(barbers, {
            id: 'pedro',
            name: 'Pedro',
            userId: 'barber-a',
            active: false,
          }),
      );
    });

    it('CA-05.1: incoherent working hours throw InvalidWorkingHoursError', async () => {
      await expectRejected(
        {
          workingHours: workingHoursInput({ monday: day('18:00', '09:00') }),
        },
        InvalidWorkingHoursError,
        'Segunda-feira: o fim da jornada deve ser depois do início.',
      );
    });
  });
});

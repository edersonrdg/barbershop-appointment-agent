import { BarberNameAlreadyExistsError } from '../../domain/errors/barber-name-already-exists.error';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
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
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { seedService } from '../testing/service-fixtures';
import {
  UpdateBarberInput,
  UpdateBarberUseCase,
} from './update-barber.use-case';

const NEW_HOURS = workingHoursInput({
  tuesday: day('10:00', '17:00'),
  friday: day('09:00', '18:00', ['12:00', '13:00']),
});

async function setup() {
  const store = new InMemoryAccountStore();
  seedBarbershop(store, 'barbershop-a', {
    tuesday: ['09:00', '18:00'],
    friday: ['09:00', '18:00', ['12:00', '13:00']],
  });
  seedBarbershop(store, 'barbershop-b');
  seedUser(store, 'barber-a', 'barber');
  seedUser(store, 'barber-a2', 'barber');
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
  await seedBarber(barbers, {
    id: 'joao',
    name: 'João',
    userId: 'barber-a',
    serviceIds: ['haircut'],
  });
  await seedBarber(barbers, {
    id: 'pedro',
    name: 'Pedro',
    userId: 'barber-a2',
  });
  await seedBarber(barbers, {
    id: 'foreign-barber',
    name: 'Bruno',
    barbershopId: 'barbershop-b',
    serviceIds: ['foreign'],
  });
  const useCase = new UpdateBarberUseCase(
    barbers,
    services,
    new InMemoryUserRepository(store),
    new InMemoryBarbershopRepository(store),
  );
  return { barbers, useCase };
}

function input(overrides: Partial<UpdateBarberInput> = {}): UpdateBarberInput {
  return {
    barbershopId: 'barbershop-a',
    barberId: 'joao',
    name: 'João Silva',
    userId: 'barber-a',
    serviceIds: ['beard', 'haircut'],
    workingHours: NEW_HOURS,
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

describe('UpdateBarberUseCase', () => {
  it('CA-05.1: replaces name, user, services and working hours, keeps active and returns the saved barber', async () => {
    const { barbers, useCase } = await setup();

    const { barber, warnings } = await useCase.execute(input());

    const expected: BarberState = {
      id: 'joao',
      barbershopId: 'barbershop-a',
      name: 'João Silva',
      active: true,
      userId: 'barber-a',
      serviceIds: ['beard', 'haircut'],
      workingHours: NEW_HOURS,
    };
    expect(describeBarber(barber)).toEqual(expected);
    expect(warnings).toEqual([]);
    const stored = await barbers.findById('barbershop-a', 'joao');
    expect(stored && describeBarber(stored)).toEqual(expected);
  });

  it('CA-05.1: an inactive barber stays inactive after the update', async () => {
    const { barbers, useCase } = await setup();
    await seedBarber(barbers, { id: 'old', name: 'Carlos', active: false });

    const { barber } = await useCase.execute(
      input({ barberId: 'old', name: 'Carlos', userId: null }),
    );

    expect(barber.active).toBe(false);
    expect((await barbers.findById('barbershop-a', 'old'))?.active).toBe(false);
  });

  it('CA-05.3: warns about the days outside the opening hours', async () => {
    const { useCase } = await setup();

    const { warnings } = await useCase.execute(
      input({
        workingHours: workingHoursInput({
          tuesday: day('09:00', '19:00'),
          monday: day('09:00', '18:00'),
        }),
      }),
    );

    expect(warnings).toEqual([
      {
        weekday: 'monday',
        message:
          'Segunda-feira: a barbearia não abre neste dia, então a jornada não estará disponível.',
      },
      {
        weekday: 'tuesday',
        message:
          'Terça-feira: só o trecho da jornada dentro do horário de funcionamento estará disponível.',
      },
    ]);
  });

  it('CA-05.2: userId null unlinks the barber', async () => {
    const { barbers, useCase } = await setup();

    await useCase.execute(input({ userId: null }));

    expect((await barbers.findById('barbershop-a', 'joao'))?.userId).toBeNull();
    expect(await barbers.findByUserId('barbershop-a', 'barber-a')).toBeNull();
  });

  it('CA-05.1: keeping its own name in another case and its own user is accepted', async () => {
    const { useCase } = await setup();

    const { barber } = await useCase.execute(input({ name: 'JOÃO' }));

    expect(barber.name).toBe('JOÃO');
    expect(barber.userId).toBe('barber-a');
  });

  describe('rejections change nothing', () => {
    async function expectRejected(
      overrides: Partial<UpdateBarberInput>,
      errorType: new (...args: never[]) => Error,
      message: string,
    ) {
      const { barbers, useCase } = await setup();
      const before = await allStates(barbers);

      const attempt = useCase.execute(input(overrides));

      await expect(attempt).rejects.toBeInstanceOf(errorType);
      await expect(attempt).rejects.toThrow(message);
      expect(await allStates(barbers)).toEqual(before);
    }

    it('CA-05.1: the name of another barber throws BarberNameAlreadyExistsError', async () => {
      await expectRejected(
        { name: 'pedro' },
        BarberNameAlreadyExistsError,
        'Já existe um barbeiro com esse nome.',
      );
    });

    it('CA-05.2: the user of another barber throws BarberUserAlreadyLinkedError', async () => {
      await expectRejected(
        { userId: 'barber-a2' },
        BarberUserAlreadyLinkedError,
        'Esse usuário já está vinculado a outro barbeiro.',
      );
    });

    it('CA-05.2: a user of another barbershop throws InvalidBarberUserError', async () => {
      await expectRejected(
        { userId: 'barber-b' },
        InvalidBarberUserError,
        'Usuário não encontrado.',
      );
    });

    it.each([
      [
        'a service of another barbershop',
        ['foreign'],
        'Serviço não encontrado.',
      ],
      [
        'an inactive service',
        ['old'],
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

    it('CA-05.1: incoherent working hours throw InvalidWorkingHoursError', async () => {
      await expectRejected(
        {
          workingHours: workingHoursInput({
            friday: day('09:00', '18:00', ['09:00', '12:00']),
          }),
        },
        InvalidWorkingHoursError,
        'Sexta-feira: o intervalo deve começar e terminar dentro da jornada, com o fim depois do início.',
      );
    });

    it.each([
      ['an unknown barber', 'missing'],
      ['a barber of another barbershop', 'foreign-barber'],
    ])('%s throws BarberNotFoundError', async (_case, barberId) => {
      await expectRejected(
        { barberId },
        BarberNotFoundError,
        'Barbeiro não encontrado.',
      );
    });
  });
});

import { InvalidServiceAddOnError } from '../../domain/errors/invalid-service-add-on.error';
import { InvalidValueError } from '../../domain/errors/invalid-value.error';
import { ServiceNameAlreadyExistsError } from '../../domain/errors/service-name-already-exists.error';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import {
  describeService,
  seedService,
  ServiceState,
} from '../testing/service-fixtures';
import {
  CreateServiceInput,
  CreateServiceUseCase,
} from './create-service.use-case';

const NOW = new Date('2026-09-28T09:00:00.000Z');

function setup() {
  const repository = new InMemoryServiceRepository();
  const useCase = new CreateServiceUseCase(
    repository,
    new FixedClock(NOW),
    new SequentialIdGenerator(),
  );
  return { repository, useCase };
}

function input(
  overrides: Partial<CreateServiceInput> = {},
): CreateServiceInput {
  return {
    barbershopId: 'barbershop-a',
    name: 'Corte',
    priceCents: 4500,
    durationMinutes: 30,
    suggestedAddOnIds: [],
    ...overrides,
  };
}

async function allStates(
  repository: InMemoryServiceRepository,
  barbershopId = 'barbershop-a',
): Promise<ServiceState[]> {
  return (await repository.listByBarbershop(barbershopId)).map(describeService);
}

describe('CreateServiceUseCase', () => {
  it('CA-04.1: creates an active service in the given barbershop and returns it as saved', async () => {
    const { repository, useCase } = setup();

    const created = await useCase.execute(input());

    const expected: ServiceState = {
      id: 'id-1',
      barbershopId: 'barbershop-a',
      name: 'Corte',
      priceCents: 4500,
      durationMinutes: 30,
      active: true,
      suggestedAddOnIds: [],
    };
    expect(describeService(created)).toEqual(expected);
    expect(created.createdAt).toEqual(NOW);
    expect(await allStates(repository)).toEqual([expected]);
  });

  it('CA-04.1: a repeated name throws ServiceNameAlreadyExistsError and nothing is saved', async () => {
    const { repository, useCase } = setup();
    await seedService(repository, { id: 'haircut', name: 'Corte' });
    const before = await allStates(repository);

    await expect(
      useCase.execute(input({ name: 'CORTE' })),
    ).rejects.toBeInstanceOf(ServiceNameAlreadyExistsError);

    expect(await allStates(repository)).toEqual(before);
  });

  it('CA-04.2: saves add-ons that are active services of the same barbershop, in the given order', async () => {
    const { repository, useCase } = setup();
    await seedService(repository, { id: 'beard', name: 'Barba' });
    await seedService(repository, { id: 'brows', name: 'Sobrancelha' });

    const created = await useCase.execute(
      input({ suggestedAddOnIds: ['brows', 'beard'] }),
    );

    expect(created.suggestedAddOnIds).toEqual(['brows', 'beard']);
    expect(
      (await repository.findById('barbershop-a', 'id-1'))?.suggestedAddOnIds,
    ).toEqual(['brows', 'beard']);
  });

  it.each([
    ['an unknown id', 'missing', 'Serviço adicional não encontrado.'],
    [
      'a service of another barbershop',
      'foreign',
      'Serviço adicional não encontrado.',
    ],
    [
      'an inactive service',
      'inactive',
      'Os serviços adicionais devem estar ativos.',
    ],
  ])(
    'CA-04.2: an add-on that is %s is rejected with InvalidServiceAddOnError and nothing is saved',
    async (_case, addOnId, message) => {
      const { repository, useCase } = setup();
      await seedService(repository, { id: 'beard', name: 'Barba' });
      await seedService(repository, {
        id: 'foreign',
        name: 'Alisamento',
        barbershopId: 'barbershop-b',
      });
      await seedService(repository, {
        id: 'inactive',
        name: 'Sobrancelha',
        active: false,
      });
      const before = await allStates(repository);

      const attempt = useCase.execute(
        input({ suggestedAddOnIds: ['beard', addOnId] }),
      );

      await expect(attempt).rejects.toBeInstanceOf(InvalidServiceAddOnError);
      await expect(attempt).rejects.toThrow(message);
      expect(await allStates(repository)).toEqual(before);
    },
  );

  it.each([
    ['a negative price', { priceCents: -1 }],
    ['a zero duration', { durationMinutes: 0 }],
  ])(
    'CA-04.4: %s throws InvalidValueError and nothing is saved',
    async (_case, overrides) => {
      const { repository, useCase } = setup();

      await expect(useCase.execute(input(overrides))).rejects.toBeInstanceOf(
        InvalidValueError,
      );

      expect(await allStates(repository)).toEqual([]);
    },
  );

  it('RN-26: the service goes only to the barbershop of the input', async () => {
    const { repository, useCase } = setup();

    await useCase.execute(input({ barbershopId: 'barbershop-b' }));

    expect(await allStates(repository)).toEqual([]);
    expect(
      (await allStates(repository, 'barbershop-b')).map((s) => s.name),
    ).toEqual(['Corte']);
  });
});

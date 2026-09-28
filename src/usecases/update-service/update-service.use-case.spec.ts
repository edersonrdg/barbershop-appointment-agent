import { InvalidServiceAddOnError } from '../../domain/errors/invalid-service-add-on.error';
import { ServiceNameAlreadyExistsError } from '../../domain/errors/service-name-already-exists.error';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import {
  describeService,
  seedService,
  ServiceState,
} from '../testing/service-fixtures';
import {
  UpdateServiceInput,
  UpdateServiceUseCase,
} from './update-service.use-case';

async function setup() {
  const repository = new InMemoryServiceRepository();
  await seedService(repository, {
    id: 'haircut',
    name: 'Corte',
    suggestedAddOnIds: [],
  });
  await seedService(repository, { id: 'beard', name: 'Barba' });
  await seedService(repository, { id: 'brows', name: 'Sobrancelha' });
  await seedService(repository, {
    id: 'foreign',
    name: 'Corte',
    barbershopId: 'barbershop-b',
  });
  const useCase = new UpdateServiceUseCase(repository);
  return { repository, useCase };
}

function input(
  overrides: Partial<UpdateServiceInput> = {},
): UpdateServiceInput {
  return {
    barbershopId: 'barbershop-a',
    serviceId: 'haircut',
    name: 'Corte Degradê',
    priceCents: 5000,
    durationMinutes: 45,
    suggestedAddOnIds: ['beard'],
    ...overrides,
  };
}

async function allStates(
  repository: InMemoryServiceRepository,
): Promise<ServiceState[]> {
  const a = await repository.listByBarbershop('barbershop-a');
  const b = await repository.listByBarbershop('barbershop-b');
  return [...a, ...b].map(describeService);
}

describe('UpdateServiceUseCase', () => {
  it('CA-04.1: replaces name, price, duration and add-ons, keeps active and returns the saved service', async () => {
    const { repository, useCase } = await setup();

    const updated = await useCase.execute(input());

    const expected: ServiceState = {
      id: 'haircut',
      barbershopId: 'barbershop-a',
      name: 'Corte Degradê',
      priceCents: 5000,
      durationMinutes: 45,
      active: true,
      suggestedAddOnIds: ['beard'],
    };
    expect(describeService(updated)).toEqual(expected);
    const stored = await repository.findById('barbershop-a', 'haircut');
    expect(stored && describeService(stored)).toEqual(expected);
  });

  it('CA-04.1: an inactive service stays inactive after the update', async () => {
    const { repository, useCase } = await setup();
    await seedService(repository, {
      id: 'old',
      name: 'Pézinho',
      active: false,
    });

    const updated = await useCase.execute(
      input({ serviceId: 'old', name: 'Pezinho', suggestedAddOnIds: [] }),
    );

    expect(updated.active).toBe(false);
    expect((await repository.findById('barbershop-a', 'old'))?.active).toBe(
      false,
    );
  });

  it('CA-04.2: replaces the add-on list, including with an empty one', async () => {
    const { repository, useCase } = await setup();
    await useCase.execute(input({ suggestedAddOnIds: ['beard'] }));

    await useCase.execute(input({ suggestedAddOnIds: ['brows'] }));
    expect(
      (await repository.findById('barbershop-a', 'haircut'))?.suggestedAddOnIds,
    ).toEqual(['brows']);

    await useCase.execute(input({ suggestedAddOnIds: [] }));
    expect(
      (await repository.findById('barbershop-a', 'haircut'))?.suggestedAddOnIds,
    ).toEqual([]);
  });

  it('CA-04.1: keeping its own name with another case is accepted', async () => {
    const { useCase } = await setup();

    const updated = await useCase.execute(input({ name: 'CORTE' }));

    expect(updated.name).toBe('CORTE');
  });

  it('CA-04.1: the name of another service throws ServiceNameAlreadyExistsError and nothing changes', async () => {
    const { repository, useCase } = await setup();
    const before = await allStates(repository);

    await expect(
      useCase.execute(input({ name: 'barba' })),
    ).rejects.toBeInstanceOf(ServiceNameAlreadyExistsError);

    expect(await allStates(repository)).toEqual(before);
  });

  it.each([
    [
      'its own id',
      ['beard', 'haircut'],
      'Um serviço não pode ser adicional de si mesmo.',
    ],
    ['an unknown id', ['missing'], 'Serviço adicional não encontrado.'],
    [
      'a service of another barbershop',
      ['foreign'],
      'Serviço adicional não encontrado.',
    ],
  ])(
    'CA-04.2: an add-on list with %s is rejected with InvalidServiceAddOnError and nothing changes',
    async (_case, suggestedAddOnIds, message) => {
      const { repository, useCase } = await setup();
      const before = await allStates(repository);

      const attempt = useCase.execute(input({ suggestedAddOnIds }));

      await expect(attempt).rejects.toBeInstanceOf(InvalidServiceAddOnError);
      await expect(attempt).rejects.toThrow(message);
      expect(await allStates(repository)).toEqual(before);
    },
  );

  it('CA-04.2: an inactive add-on is rejected and nothing changes', async () => {
    const { repository, useCase } = await setup();
    await seedService(repository, {
      id: 'inactive',
      name: 'Hidratação',
      active: false,
    });
    const before = await allStates(repository);

    const attempt = useCase.execute(input({ suggestedAddOnIds: ['inactive'] }));

    await expect(attempt).rejects.toThrow(
      'Os serviços adicionais devem estar ativos.',
    );
    expect(await allStates(repository)).toEqual(before);
  });

  it.each([
    ['an unknown service', 'barbershop-a', 'missing'],
    ['a service of another barbershop', 'barbershop-a', 'foreign'],
  ])(
    'CA-04.3: %s throws ServiceNotFoundError and nothing changes',
    async (_case, barbershopId, serviceId) => {
      const { repository, useCase } = await setup();
      const before = await allStates(repository);

      await expect(
        useCase.execute(
          input({ barbershopId, serviceId, suggestedAddOnIds: [] }),
        ),
      ).rejects.toBeInstanceOf(ServiceNotFoundError);

      expect(await allStates(repository)).toEqual(before);
    },
  );
});

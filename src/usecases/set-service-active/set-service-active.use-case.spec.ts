import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import {
  describeService,
  seedService,
  ServiceState,
} from '../testing/service-fixtures';
import { SetServiceActiveUseCase } from './set-service-active.use-case';

const HAIRCUT: ServiceState = {
  id: 'haircut',
  barbershopId: 'barbershop-a',
  name: 'Corte',
  priceCents: 4500,
  durationMinutes: 30,
  active: true,
  suggestedAddOnIds: ['beard'],
};

async function setup() {
  const repository = new InMemoryServiceRepository();
  await seedService(repository, { id: 'beard', name: 'Barba' });
  await seedService(repository, HAIRCUT);
  await seedService(repository, {
    id: 'foreign',
    name: 'Corte',
    barbershopId: 'barbershop-b',
  });
  const useCase = new SetServiceActiveUseCase(repository);
  return { repository, useCase };
}

async function stored(
  repository: InMemoryServiceRepository,
  barbershopId = 'barbershop-a',
  serviceId = 'haircut',
): Promise<ServiceState | null> {
  const service = await repository.findById(barbershopId, serviceId);
  return service && describeService(service);
}

describe('SetServiceActiveUseCase', () => {
  it('CA-04.3: deactivating marks the service inactive and keeps name, price, duration and add-ons', async () => {
    const { repository, useCase } = await setup();

    const result = await useCase.execute({
      barbershopId: 'barbershop-a',
      serviceId: 'haircut',
      active: false,
    });

    expect(describeService(result)).toEqual({ ...HAIRCUT, active: false });
    expect(await stored(repository)).toEqual({ ...HAIRCUT, active: false });
  });

  it('CA-04.3: activating an inactive service turns it back on', async () => {
    const { repository, useCase } = await setup();
    await useCase.execute({
      barbershopId: 'barbershop-a',
      serviceId: 'haircut',
      active: false,
    });

    const result = await useCase.execute({
      barbershopId: 'barbershop-a',
      serviceId: 'haircut',
      active: true,
    });

    expect(describeService(result)).toEqual(HAIRCUT);
    expect(await stored(repository)).toEqual(HAIRCUT);
  });

  it.each([false, true])(
    'CA-04.3: repeating active=%p returns the service unchanged',
    async (active) => {
      const { repository, useCase } = await setup();
      const command = {
        barbershopId: 'barbershop-a',
        serviceId: 'haircut',
        active,
      };
      await useCase.execute(command);

      const result = await useCase.execute(command);

      expect(describeService(result)).toEqual({ ...HAIRCUT, active });
      expect(await stored(repository)).toEqual({ ...HAIRCUT, active });
    },
  );

  it.each([
    ['an unknown service', 'missing'],
    ['a service of another barbershop', 'foreign'],
  ])(
    'CA-04.3: %s throws ServiceNotFoundError and nothing changes',
    async (_case, serviceId) => {
      const { repository, useCase } = await setup();

      await expect(
        useCase.execute({
          barbershopId: 'barbershop-a',
          serviceId,
          active: false,
        }),
      ).rejects.toBeInstanceOf(ServiceNotFoundError);

      expect(
        (await stored(repository, 'barbershop-b', 'foreign'))?.active,
      ).toBe(true);
      expect(await stored(repository)).toEqual(HAIRCUT);
    },
  );
});

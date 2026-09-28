import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import { seedService } from '../testing/service-fixtures';
import { ListBookableServicesUseCase } from './list-bookable-services.use-case';

async function setup() {
  const repository = new InMemoryServiceRepository();
  await seedService(repository, {
    id: 'haircut',
    name: 'Corte',
    priceCents: 4500,
    durationMinutes: 30,
  });
  await seedService(repository, {
    id: 'beard',
    name: 'Barba',
    priceCents: 2000,
    durationMinutes: 20,
  });
  await seedService(repository, {
    id: 'brows',
    name: 'Sobrancelha',
    active: false,
  });
  await seedService(repository, {
    id: 'foreign',
    name: 'Alisamento',
    barbershopId: 'barbershop-b',
  });
  const useCase = new ListBookableServicesUseCase(repository);
  return { repository, useCase };
}

async function bookableIds(
  useCase: ListBookableServicesUseCase,
): Promise<string[]> {
  const listed = await useCase.execute({ barbershopId: 'barbershop-a' });
  return listed.map((service) => service.id);
}

describe('ListBookableServicesUseCase', () => {
  it('CA-04.1: returns only the active services of the barbershop, with price and duration', async () => {
    const { useCase } = await setup();

    const listed = await useCase.execute({ barbershopId: 'barbershop-a' });

    expect(
      listed.map((service) => ({
        id: service.id,
        priceCents: service.priceCents,
        durationMinutes: service.durationMinutes,
      })),
    ).toEqual([
      { id: 'beard', priceCents: 2000, durationMinutes: 20 },
      { id: 'haircut', priceCents: 4500, durationMinutes: 30 },
    ]);
  });

  it('CA-04.3: a deactivated service disappears and comes back when reactivated', async () => {
    const { repository, useCase } = await setup();
    const haircut = await repository.findById('barbershop-a', 'haircut');
    if (!haircut) throw new Error('seed missing');

    haircut.deactivate();
    await repository.save(haircut);
    expect(await bookableIds(useCase)).toEqual(['beard']);

    haircut.activate();
    await repository.save(haircut);
    expect(await bookableIds(useCase)).toEqual(['beard', 'haircut']);
  });

  it('RN-26: does not return services of another barbershop', async () => {
    const { useCase } = await setup();

    const listed = await useCase.execute({ barbershopId: 'barbershop-b' });

    expect(listed.map((service) => service.id)).toEqual(['foreign']);
  });
});

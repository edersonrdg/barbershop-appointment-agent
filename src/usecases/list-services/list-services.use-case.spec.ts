import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import { seedService } from '../testing/service-fixtures';
import { ListServicesUseCase } from './list-services.use-case';

describe('ListServicesUseCase', () => {
  it('CA-04.1: returns active and inactive services of the barbershop by case-insensitive name, without other barbershops', async () => {
    const repository = new InMemoryServiceRepository();
    await seedService(repository, { id: 'haircut', name: 'Corte' });
    await seedService(repository, {
      id: 'brows',
      name: 'Sobrancelha',
      active: false,
    });
    await seedService(repository, { id: 'beard', name: 'barba' });
    await seedService(repository, {
      id: 'foreign',
      name: 'Alisamento',
      barbershopId: 'barbershop-b',
    });

    const listed = await new ListServicesUseCase(repository).execute({
      barbershopId: 'barbershop-a',
    });

    expect(
      listed.map((service) => [service.id, service.name, service.active]),
    ).toEqual([
      ['beard', 'barba', true],
      ['haircut', 'Corte', true],
      ['brows', 'Sobrancelha', false],
    ]);
  });

  it('CA-04.1: returns an empty list when the barbershop has no services', async () => {
    const repository = new InMemoryServiceRepository();
    await seedService(repository, {
      id: 'foreign',
      name: 'Corte',
      barbershopId: 'barbershop-b',
    });

    const listed = await new ListServicesUseCase(repository).execute({
      barbershopId: 'barbershop-a',
    });

    expect(listed).toEqual([]);
  });
});

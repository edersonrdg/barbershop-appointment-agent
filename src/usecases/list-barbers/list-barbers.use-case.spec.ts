import { describeBarber, seedBarber } from '../testing/barber-fixtures';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { ListBarbersUseCase } from './list-barbers.use-case';

describe('ListBarbersUseCase', () => {
  it('CA-05.1: lists active and inactive barbers of the barbershop by case-insensitive name', async () => {
    const barbers = new InMemoryBarberRepository();
    await seedBarber(barbers, { id: 'joao', name: 'João' });
    await seedBarber(barbers, { id: 'ana', name: 'ana' });
    await seedBarber(barbers, { id: 'pedro', name: 'Pedro', active: false });
    await seedBarber(barbers, {
      id: 'bruno',
      name: 'Bruno',
      barbershopId: 'barbershop-b',
    });

    const listed = await new ListBarbersUseCase(barbers).execute({
      barbershopId: 'barbershop-a',
    });

    expect(listed.map((barber) => [barber.id, barber.active])).toEqual([
      ['ana', true],
      ['joao', true],
      ['pedro', false],
    ]);
    expect(describeBarber(listed[1]).serviceIds).toEqual(['haircut']);
  });

  it('CA-05.1: a barbershop without barbers lists nothing', async () => {
    const barbers = new InMemoryBarberRepository();
    await seedBarber(barbers, {
      id: 'bruno',
      name: 'Bruno',
      barbershopId: 'barbershop-b',
    });

    expect(
      await new ListBarbersUseCase(barbers).execute({
        barbershopId: 'barbershop-a',
      }),
    ).toEqual([]);
  });
});

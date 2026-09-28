import { seedBarber } from '../testing/barber-fixtures';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { FindBarberByUserUseCase } from './find-barber-by-user.use-case';

async function setup() {
  const barbers = new InMemoryBarberRepository();
  await seedBarber(barbers, { id: 'joao', name: 'João', userId: 'barber-a' });
  await seedBarber(barbers, { id: 'pedro', name: 'Pedro' });
  return new FindBarberByUserUseCase(barbers);
}

describe('FindBarberByUserUseCase', () => {
  it('CA-05.2: returns the barber linked to the user', async () => {
    const useCase = await setup();

    const barber = await useCase.execute({
      barbershopId: 'barbershop-a',
      userId: 'barber-a',
    });

    expect(barber?.id).toBe('joao');
  });

  it('CA-05.2: returns null for a user without barber', async () => {
    const useCase = await setup();

    expect(
      await useCase.execute({
        barbershopId: 'barbershop-a',
        userId: 'owner-a',
      }),
    ).toBeNull();
  });

  it('RN-26: returns null for the same user id in another barbershop', async () => {
    const useCase = await setup();

    expect(
      await useCase.execute({
        barbershopId: 'barbershop-b',
        userId: 'barber-a',
      }),
    ).toBeNull();
  });
});

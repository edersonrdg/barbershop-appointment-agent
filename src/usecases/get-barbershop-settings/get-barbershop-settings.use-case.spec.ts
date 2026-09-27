import { Barbershop } from '../../domain/entities/barbershop';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { GetBarbershopSettingsUseCase } from './get-barbershop-settings.use-case';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function setup() {
  const store = new InMemoryAccountStore();
  const a = Barbershop.startTrial({
    id: 'barbershop-a',
    name: 'Barbearia A',
    now: NOW,
  });
  const b = Barbershop.startTrial({
    id: 'barbershop-b',
    name: 'Barbearia B',
    now: NOW,
  });
  store.barbershops.push(a, b);
  const useCase = new GetBarbershopSettingsUseCase(
    new InMemoryBarbershopRepository(store),
  );
  return { a, b, useCase };
}

describe('GetBarbershopSettingsUseCase', () => {
  it('CA-03.1: returns the barbershop of the given tenant, never the other one (RN-26)', async () => {
    const { a, b, useCase } = setup();

    const settingsA = await useCase.execute({ barbershopId: 'barbershop-a' });
    const settingsB = await useCase.execute({ barbershopId: 'barbershop-b' });

    expect(settingsA).toBe(a);
    expect(settingsA.name).toBe('Barbearia A');
    expect(settingsB).toBe(b);
    expect(settingsB.name).toBe('Barbearia B');
  });

  it('CA-03.1: an unknown barbershop throws InvalidCredentialsError', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute({ barbershopId: 'barbershop-x' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

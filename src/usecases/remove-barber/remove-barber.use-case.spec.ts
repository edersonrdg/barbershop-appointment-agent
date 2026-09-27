import { User } from '../../domain/entities/user';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { RemoveBarberUseCase } from './remove-barber.use-case';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function barber(id: string, barbershopId: string): User {
  return User.createBarber({
    id,
    barbershopId,
    name: id,
    email: `${id}@exemplo.com`,
    passwordHash: 'hash',
    now: NOW,
  });
}

function setup() {
  const store = new InMemoryAccountStore();
  store.users.push(
    User.createOwner({
      id: 'owner-a',
      barbershopId: 'barbershop-a',
      name: 'Ana',
      email: 'ana@exemplo.com',
      phone: '+5511912345678',
      passwordHash: 'hash',
      now: NOW,
    }),
    barber('barber-a1', 'barbershop-a'),
    barber('barber-a2', 'barbershop-a'),
    barber('barber-b1', 'barbershop-b'),
  );
  return {
    store,
    useCase: new RemoveBarberUseCase(new InMemoryUserRepository(store)),
  };
}

describe('RemoveBarberUseCase', () => {
  it.each([
    ['an owner of the barbershop', 'owner-a'],
    ['a barber of another barbershop', 'barber-b1'],
    ['a missing id', 'missing'],
  ])(
    'CA-02.3: throws UserNotFoundError for %s and removes nothing (C29)',
    async (_case, userId) => {
      const { store, useCase } = setup();

      await expect(
        useCase.execute({ barbershopId: 'barbershop-a', userId }),
      ).rejects.toBeInstanceOf(UserNotFoundError);
      expect(store.users).toHaveLength(4);
    },
  );

  it('CA-02.3: removes only the requested barber (C29)', async () => {
    const { store, useCase } = setup();

    await useCase.execute({
      barbershopId: 'barbershop-a',
      userId: 'barber-a1',
    });

    expect(store.users.map((user) => user.id)).toEqual([
      'owner-a',
      'barber-a2',
      'barber-b1',
    ]);
  });
});

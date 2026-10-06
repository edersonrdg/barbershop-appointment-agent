import { Barbershop } from '../../domain/entities/barbershop';
import { User } from '../../domain/entities/user';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemorySubscriptionRepository } from '../testing/in-memory-subscription.repository';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { SettableClock } from '../testing/settable-clock';
import { subscriptionOf } from '../testing/subscription-fixtures';
import { GetSuspensionReasonUseCase } from '../get-suspension-reason/get-suspension-reason.use-case';
import { GetMyAccountUseCase } from './get-my-account.use-case';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function tenant(suffix: string) {
  const barbershop = Barbershop.startTrial({
    id: `barbershop-${suffix}`,
    name: `Barbearia ${suffix}`,
    now: NOW,
  });
  const owner = User.createOwner({
    id: `user-${suffix}`,
    barbershopId: barbershop.id,
    name: `Dono ${suffix}`,
    email: `dono@${suffix}.com`,
    phone: '+5511912345678',
    passwordHash: 'hashed(senha)',
    now: NOW,
  });
  return { barbershop, owner };
}

function setup(subscriptions = new InMemorySubscriptionRepository()) {
  const store = new InMemoryAccountStore();
  const a = tenant('a');
  const b = tenant('b');
  store.barbershops.push(a.barbershop, b.barbershop);
  store.users.push(a.owner, b.owner);
  const useCase = new GetMyAccountUseCase(
    new InMemoryUserRepository(store),
    new InMemoryBarbershopRepository(store),
    new GetSuspensionReasonUseCase(subscriptions, new SettableClock(NOW), 5),
  );
  return { a, b, useCase };
}

describe('GetMyAccountUseCase', () => {
  it('CA-01.4: returns only the user and barbershop of the given tenant when two barbershops exist', async () => {
    const { a, b, useCase } = setup();

    const accountA = await useCase.execute({
      barbershopId: 'barbershop-a',
      userId: 'user-a',
    });
    const accountB = await useCase.execute({
      barbershopId: 'barbershop-b',
      userId: 'user-b',
    });

    expect(accountA.user).toBe(a.owner);
    expect(accountA.barbershop).toBe(a.barbershop);
    expect(accountB.user).toBe(b.owner);
    expect(accountB.barbershop).toBe(b.barbershop);
  });

  it("CA-01.4: rejects A's user id combined with B's barbershop id without leaking data from either", async () => {
    const { useCase } = setup();

    const attempt = useCase.execute({
      barbershopId: 'barbershop-b',
      userId: 'user-a',
    });

    await expect(attempt).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(attempt).rejects.toThrow('E-mail ou senha inválidos.');
  });

  describe('US-21', () => {
    it('CA-21.2, AC 17 (C20): returns the suspension reason of the barbershop', async () => {
      const subscriptions = new InMemorySubscriptionRepository();
      subscriptions.add(
        subscriptionOf({
          barbershopId: 'barbershop-a',
          trialEndsAt: new Date(NOW.getTime() - 1),
        }),
      );
      subscriptions.add(
        subscriptionOf({
          barbershopId: 'barbershop-b',
          trialEndsAt: new Date(NOW.getTime() + 1),
        }),
      );
      const { useCase } = setup(subscriptions);

      const suspended = await useCase.execute({
        barbershopId: 'barbershop-a',
        userId: 'user-a',
      });
      const inGoodStanding = await useCase.execute({
        barbershopId: 'barbershop-b',
        userId: 'user-b',
      });

      expect(suspended.suspensionReason).toBe('trial_ended');
      expect(inGoodStanding.suspensionReason).toBeNull();
    });
  });
});

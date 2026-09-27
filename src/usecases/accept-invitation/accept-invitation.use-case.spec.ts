import { User } from '../../domain/entities/user';
import { UserInvitation } from '../../domain/entities/user-invitation';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error';
import { InvalidInvitationError } from '../../domain/errors/invalid-invitation.error';
import { FakeAccessTokenIssuer } from '../testing/fake-access-token-issuer';
import { FakePasswordHasher } from '../testing/fake-password-hasher';
import { FakeResetTokenGenerator } from '../testing/fake-reset-token-generator';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryUserInvitationRepository } from '../testing/in-memory-user-invitation.repository';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import { AcceptInvitationUseCase } from './accept-invitation.use-case';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const TOKEN = 'invite-token';

function setup() {
  const store = new InMemoryAccountStore();
  const tokenGenerator = new FakeResetTokenGenerator();
  store.userInvitations.push(
    UserInvitation.issue({
      id: 'invitation-1',
      barbershopId: 'barbershop-a',
      email: 'joao@exemplo.com',
      name: 'João Pereira',
      tokenHash: tokenGenerator.hashOf(TOKEN),
      now: NOW,
    }),
  );
  const tokenIssuer = new FakeAccessTokenIssuer();
  const useCase = new AcceptInvitationUseCase(
    new InMemoryUserInvitationRepository(store),
    new InMemoryUserRepository(store),
    tokenGenerator,
    new FakePasswordHasher(),
    tokenIssuer,
    new FixedClock(NOW),
    new SequentialIdGenerator(),
  );
  return { store, useCase, tokenIssuer };
}

describe('AcceptInvitationUseCase', () => {
  it('CA-02.1: creates a barber of the inviting barbershop with no phone and the hashed password (C15)', async () => {
    const { store, useCase, tokenIssuer } = setup();

    await useCase.execute({ token: TOKEN, password: 'senha-do-joao' });

    expect(store.users).toHaveLength(1);
    const [barber] = store.users;
    expect(barber.role).toBe('barber');
    expect(barber.phone).toBeNull();
    expect(barber.barbershopId).toBe('barbershop-a');
    expect(barber.email).toBe('joao@exemplo.com');
    expect(barber.name).toBe('João Pereira');
    expect(barber.passwordHash).toBe('hashed(senha-do-joao)');
    expect(store.userInvitations[0].acceptedAt).toEqual(NOW);
    expect(tokenIssuer.issued).toEqual([
      { userId: barber.id, barbershopId: 'barbershop-a', role: 'barber' },
    ]);
  });

  it('CA-02.1: rejects an e-mail already in use and keeps the invitation pending (C15)', async () => {
    const { store, useCase } = setup();
    store.users.push(
      User.createOwner({
        id: 'owner-b',
        barbershopId: 'barbershop-b',
        name: 'Bruno',
        email: 'joao@exemplo.com',
        phone: '+5521987654321',
        passwordHash: 'hash',
        now: NOW,
      }),
    );

    await expect(
      useCase.execute({ token: TOKEN, password: 'senha-do-joao' }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(store.userInvitations[0].acceptedAt).toBeNull();
    expect(store.users).toHaveLength(1);
  });

  it('CA-02.1: rejects an unknown token', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute({ token: 'outro-token', password: 'senha-do-joao' }),
    ).rejects.toBeInstanceOf(InvalidInvitationError);
  });

  it('CA-02.1: rejects a token that was already accepted', async () => {
    const { useCase } = setup();
    await useCase.execute({ token: TOKEN, password: 'senha-do-joao' });

    await expect(
      useCase.execute({ token: TOKEN, password: 'outra-senha-123' }),
    ).rejects.toBeInstanceOf(InvalidInvitationError);
  });
});

import { User } from '../../domain/entities/user';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import {
  FAKE_TOKEN_TTL_SECONDS,
  FakeAccessTokenIssuer,
} from '../testing/fake-access-token-issuer';
import { FakePasswordHasher } from '../testing/fake-password-hasher';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { AuthenticateUserUseCase } from './authenticate-user.use-case';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function owner(id: string, barbershopId: string, email: string, plain: string) {
  return User.createOwner({
    id,
    barbershopId,
    name: 'Dono',
    email,
    phone: '+5511912345678',
    passwordHash: `hashed(${plain})`,
    now: NOW,
  });
}

function setup() {
  const store = new InMemoryAccountStore();
  store.users.push(
    owner('user-a', 'barbershop-a', 'dono@a.com', 'senha-da-a-123'),
    owner('user-b', 'barbershop-b', 'dono@b.com', 'senha-da-b-123'),
  );
  const tokenIssuer = new FakeAccessTokenIssuer();
  const useCase = new AuthenticateUserUseCase(
    new InMemoryUserRepository(store),
    new FakePasswordHasher(),
    tokenIssuer,
  );
  return { tokenIssuer, useCase };
}

describe('AuthenticateUserUseCase', () => {
  it('issues a session with the user id and tenant for correct credentials, even with upper case and spaces in the e-mail', async () => {
    const { tokenIssuer, useCase } = setup();

    const session = await useCase.execute({
      email: '  DONO@B.com ',
      password: 'senha-da-b-123',
    });

    expect(tokenIssuer.issued).toEqual([
      { userId: 'user-b', barbershopId: 'barbershop-b', role: 'owner' },
    ]);
    expect(session).toEqual({
      accessToken: 'token(user-b|barbershop-b|owner)',
      expiresIn: FAKE_TOKEN_TTL_SECONDS,
    });
  });

  it('rejects a wrong password and an unknown e-mail with the same error and message', async () => {
    const { tokenIssuer, useCase } = setup();

    const wrongPassword = useCase.execute({
      email: 'dono@a.com',
      password: 'senha-da-b-123',
    });
    const unknownEmail = useCase.execute({
      email: 'ninguem@a.com',
      password: 'senha-da-a-123',
    });
    const unparseableEmail = useCase.execute({
      email: 'dono-sem-arroba',
      password: 'senha-da-a-123',
    });

    for (const attempt of [wrongPassword, unknownEmail, unparseableEmail]) {
      await expect(attempt).rejects.toBeInstanceOf(InvalidCredentialsError);
      await expect(attempt).rejects.toThrow('E-mail ou senha inválidos.');
    }
    expect(tokenIssuer.issued).toEqual([]);
  });
});

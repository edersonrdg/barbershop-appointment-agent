import { PasswordResetToken } from '../../domain/entities/password-reset-token';
import { User } from '../../domain/entities/user';
import { InvalidPasswordResetTokenError } from '../../domain/errors/invalid-password-reset-token.error';
import { FakePasswordHasher } from '../testing/fake-password-hasher';
import { FakeResetTokenGenerator } from '../testing/fake-reset-token-generator';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryPasswordResetRepository } from '../testing/in-memory-password-reset.repository';
import { ResetPasswordUseCase } from './reset-password.use-case';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const OLD_HASH = 'hashed(senha-antiga-123)';

// Simulates a concurrent request redeeming the same token between the lookup
// and this request's redeem.
class RacingPasswordResetRepository extends InMemoryPasswordResetRepository {
  override async findByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetToken | null> {
    const token = await super.findByTokenHash(tokenHash);
    if (token) {
      await super.redeem({
        barbershopId: token.barbershopId,
        userId: token.userId,
        tokenId: token.id,
        passwordHash: 'hashed(senha-da-outra-requisicao)',
        usedAt: NOW,
      });
    }
    return token;
  }
}

function setup(
  makeRepository: (
    store: InMemoryAccountStore,
  ) => InMemoryPasswordResetRepository = (store) =>
    new InMemoryPasswordResetRepository(store),
) {
  const store = new InMemoryAccountStore();
  store.users.push(
    User.createOwner({
      id: 'user-a',
      barbershopId: 'barbershop-a',
      name: 'José',
      email: 'dono@barbearia.com',
      phone: '+5511912345678',
      passwordHash: OLD_HASH,
      now: NOW,
    }),
  );
  const tokenGenerator = new FakeResetTokenGenerator();
  const passwordResets = makeRepository(store);
  const useCase = new ResetPasswordUseCase(
    passwordResets,
    tokenGenerator,
    new FakePasswordHasher(),
    new FixedClock(NOW),
  );

  async function issueToken(issuedAt: Date): Promise<string> {
    const { token, tokenHash } = tokenGenerator.generate();
    await passwordResets.replaceForUser(
      PasswordResetToken.issue({
        id: `token-id-${token}`,
        userId: 'user-a',
        barbershopId: 'barbershop-a',
        tokenHash,
        now: issuedAt,
      }),
    );
    return token;
  }

  return { store, passwordResets, issueToken, useCase };
}

describe('ResetPasswordUseCase', () => {
  it('CA-01.5: stores the new password hash and marks the token as used at now for a valid token', async () => {
    const { store, issueToken, useCase } = setup();
    const token = await issueToken(new Date(NOW.getTime() - 30 * 60 * 1000));

    await useCase.execute({ token, newPassword: 'nova-senha-123' });

    expect(store.users[0].passwordHash).toBe('hashed(nova-senha-123)');
    expect(store.passwordResetTokens).toHaveLength(1);
    expect(store.passwordResetTokens[0].tokenHash).toBe(`sha256(${token})`);
    expect(store.passwordResetTokens[0].usedAt).toEqual(NOW);
  });

  describe('tokens that cannot be redeemed keep the password', () => {
    it('CA-01.5: rejects an expired token (issued 1 h ago)', async () => {
      const { store, issueToken, useCase } = setup();
      const token = await issueToken(new Date(NOW.getTime() - ONE_HOUR_MS));

      await expect(
        useCase.execute({ token, newPassword: 'nova-senha-123' }),
      ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

      expect(store.users[0].passwordHash).toBe(OLD_HASH);
      expect(store.passwordResetTokens[0].usedAt).toBeNull();
    });

    it('CA-01.5: rejects a token that was already used', async () => {
      const { store, issueToken, useCase } = setup();
      const token = await issueToken(NOW);
      await useCase.execute({ token, newPassword: 'primeira-nova-123' });

      await expect(
        useCase.execute({ token, newPassword: 'segunda-nova-123' }),
      ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

      expect(store.users[0].passwordHash).toBe('hashed(primeira-nova-123)');
    });

    it('CA-01.5: rejects a token replaced by a newer request', async () => {
      const { store, issueToken, useCase } = setup();
      const oldToken = await issueToken(NOW);
      await issueToken(NOW);

      await expect(
        useCase.execute({ token: oldToken, newPassword: 'nova-senha-123' }),
      ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

      expect(store.users[0].passwordHash).toBe(OLD_HASH);
    });

    it('CA-01.5: rejects a token that does not exist', async () => {
      const { store, useCase } = setup();

      await expect(
        useCase.execute({
          token: 'inexistente',
          newPassword: 'nova-senha-123',
        }),
      ).rejects.toThrow('Link de redefinição inválido ou expirado.');

      expect(store.users[0].passwordHash).toBe(OLD_HASH);
    });
  });

  it('CA-01.5: rejects the token when redeem returns false because another request won the race', async () => {
    const { store, issueToken, useCase } = setup(
      (s) => new RacingPasswordResetRepository(s),
    );
    const token = await issueToken(NOW);

    await expect(
      useCase.execute({ token, newPassword: 'nova-senha-123' }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

    expect(store.users[0].passwordHash).toBe(
      'hashed(senha-da-outra-requisicao)',
    );
  });
});

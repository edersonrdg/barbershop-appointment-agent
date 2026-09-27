import { PasswordResetToken } from '../../domain/entities/password-reset-token';
import { User } from '../../domain/entities/user';
import {
  PasswordResetRepository,
  RedeemPasswordResetInput,
} from '../ports/password-reset.repository.port';
import { InMemoryAccountStore } from './in-memory-account-store';

export class InMemoryPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly store: InMemoryAccountStore) {}

  replaceForUser(token: PasswordResetToken): Promise<void> {
    this.store.passwordResetTokens = this.store.passwordResetTokens.filter(
      (existing) =>
        existing.userId !== token.userId || existing.usedAt !== null,
    );
    this.store.passwordResetTokens.push(token);
    return Promise.resolve();
  }

  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const found = this.store.passwordResetTokens.find(
      (token) => token.tokenHash === tokenHash,
    );
    return Promise.resolve(found ?? null);
  }

  redeem(input: RedeemPasswordResetInput): Promise<boolean> {
    const tokenIndex = this.store.passwordResetTokens.findIndex(
      (token) =>
        token.id === input.tokenId &&
        token.barbershopId === input.barbershopId &&
        token.userId === input.userId &&
        token.usedAt === null,
    );
    const userIndex = this.store.users.findIndex(
      (user) =>
        user.id === input.userId && user.barbershopId === input.barbershopId,
    );
    if (tokenIndex === -1 || userIndex === -1) {
      return Promise.resolve(false);
    }

    const token = this.store.passwordResetTokens[tokenIndex];
    this.store.passwordResetTokens[tokenIndex] = PasswordResetToken.restore({
      id: token.id,
      userId: token.userId,
      barbershopId: token.barbershopId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: input.usedAt,
      createdAt: token.createdAt,
    });
    const user = this.store.users[userIndex];
    this.store.users[userIndex] = User.restore({
      id: user.id,
      barbershopId: user.barbershopId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      passwordHash: input.passwordHash,
      role: user.role,
      createdAt: user.createdAt,
    });
    return Promise.resolve(true);
  }
}

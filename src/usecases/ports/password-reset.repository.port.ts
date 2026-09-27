import { PasswordResetToken } from '../../domain/entities/password-reset-token';

export const PASSWORD_RESET_REPOSITORY = Symbol('PasswordResetRepository');

export interface RedeemPasswordResetInput {
  barbershopId: string;
  userId: string;
  tokenId: string;
  passwordHash: string;
  usedAt: Date;
}

export interface PasswordResetRepository {
  // A new request invalidates the previous ones: the user's unused tokens are
  // deleted before the new one is stored.
  replaceForUser(token: PasswordResetToken): Promise<void>;
  // RN-26 exception (AD-004): the reset happens without a session, so the
  // tenant comes from the token found by its hash.
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  // Marks the token as used only if it is still unused and swaps the password
  // in the same transaction; returns false when another request won the race.
  redeem(input: RedeemPasswordResetInput): Promise<boolean>;
}

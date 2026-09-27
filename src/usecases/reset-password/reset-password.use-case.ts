import { InvalidPasswordResetTokenError } from '../../domain/errors/invalid-password-reset-token.error';
import { Clock } from '../ports/clock.port';
import { PasswordHasher } from '../ports/password-hasher.port';
import { PasswordResetRepository } from '../ports/password-reset.repository.port';
import { ResetTokenGenerator } from '../ports/reset-token-generator.port';

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export class ResetPasswordUseCase {
  constructor(
    private readonly passwordResets: PasswordResetRepository,
    private readonly resetTokenGenerator: ResetTokenGenerator,
    private readonly passwordHasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const now = this.clock.now();
    const resetToken = await this.passwordResets.findByTokenHash(
      this.resetTokenGenerator.hashOf(input.token),
    );
    if (!resetToken || !resetToken.isRedeemable(now)) {
      throw new InvalidPasswordResetTokenError();
    }

    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    const redeemed = await this.passwordResets.redeem({
      barbershopId: resetToken.barbershopId,
      userId: resetToken.userId,
      tokenId: resetToken.id,
      passwordHash,
      usedAt: now,
    });
    if (!redeemed) {
      throw new InvalidPasswordResetTokenError();
    }
  }
}

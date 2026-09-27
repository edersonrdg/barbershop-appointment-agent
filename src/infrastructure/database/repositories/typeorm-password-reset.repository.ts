import { DataSource, IsNull } from 'typeorm';
import { PasswordResetToken } from '../../../domain/entities/password-reset-token';
import {
  PasswordResetRepository,
  RedeemPasswordResetInput,
} from '../../../usecases/ports/password-reset.repository.port';
import { PasswordResetTokenEntity } from '../entities/password-reset-token.entity';
import { UserEntity } from '../entities/user.entity';

export class TypeOrmPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly dataSource: DataSource) {}

  async replaceForUser(token: PasswordResetToken): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PasswordResetTokenEntity, {
        userId: token.userId,
        usedAt: IsNull(),
      });
      await manager.insert(PasswordResetTokenEntity, {
        id: token.id,
        userId: token.userId,
        barbershopId: token.barbershopId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
        createdAt: token.createdAt,
      });
    });
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const row = await this.dataSource
      .getRepository(PasswordResetTokenEntity)
      .findOneBy({ tokenHash });
    if (!row) return null;
    return PasswordResetToken.restore({
      id: row.id,
      userId: row.userId,
      barbershopId: row.barbershopId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      createdAt: row.createdAt,
    });
  }

  async redeem(input: RedeemPasswordResetInput): Promise<boolean> {
    const rollback = new Error('user outside the token tenant');
    try {
      return await this.dataSource.transaction(async (manager) => {
        const tokenUpdate = await manager.update(
          PasswordResetTokenEntity,
          {
            id: input.tokenId,
            userId: input.userId,
            barbershopId: input.barbershopId,
            usedAt: IsNull(),
          },
          { usedAt: input.usedAt },
        );
        if (tokenUpdate.affected === 0) return false;

        const userUpdate = await manager.update(
          UserEntity,
          { id: input.userId, barbershopId: input.barbershopId },
          { passwordHash: input.passwordHash },
        );
        // RN-26: a token whose tenant differs from the user's must not be
        // consumed, so the token update is rolled back.
        if (userUpdate.affected === 0) throw rollback;

        return true;
      });
    } catch (error) {
      if (error === rollback) return false;
      throw error;
    }
  }
}

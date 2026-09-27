import { DataSource, IsNull } from 'typeorm';
import { UserInvitation } from '../../../domain/entities/user-invitation';
import { EmailAlreadyRegisteredError } from '../../../domain/errors/email-already-registered.error';
import {
  AcceptInvitationInput,
  UserInvitationRepository,
} from '../../../usecases/ports/user-invitation.repository.port';
import { UserEntity } from '../entities/user.entity';
import { UserInvitationEntity } from '../entities/user-invitation.entity';
import { isEmailUniqueViolation } from './email-unique-violation';

export class TypeOrmUserInvitationRepository implements UserInvitationRepository {
  constructor(private readonly dataSource: DataSource) {}

  async replacePending(invitation: UserInvitation): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(UserInvitationEntity, {
        barbershopId: invitation.barbershopId,
        email: invitation.email,
        acceptedAt: IsNull(),
      });
      await manager.insert(UserInvitationEntity, {
        id: invitation.id,
        barbershopId: invitation.barbershopId,
        email: invitation.email,
        name: invitation.name,
        tokenHash: invitation.tokenHash,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
        createdAt: invitation.createdAt,
      });
    });
  }

  async findByTokenHash(tokenHash: string): Promise<UserInvitation | null> {
    const row = await this.dataSource
      .getRepository(UserInvitationEntity)
      .findOneBy({ tokenHash });
    if (!row) return null;
    return UserInvitation.restore({
      id: row.id,
      barbershopId: row.barbershopId,
      email: row.email,
      name: row.name,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      acceptedAt: row.acceptedAt,
      createdAt: row.createdAt,
    });
  }

  async accept({
    invitation,
    user,
    acceptedAt,
  }: AcceptInvitationInput): Promise<boolean> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const update = await manager.update(
          UserInvitationEntity,
          { id: invitation.id, acceptedAt: IsNull() },
          { acceptedAt },
        );
        if (update.affected === 0) return false;

        await manager.insert(UserEntity, {
          id: user.id,
          barbershopId: user.barbershopId,
          name: user.name,
          email: user.email,
          phone: user.phone,
          passwordHash: user.passwordHash,
          role: user.role,
          createdAt: user.createdAt,
        });
        return true;
      });
    } catch (error) {
      if (isEmailUniqueViolation(error)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }
}

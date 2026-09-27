import { DataSource } from 'typeorm';
import {
  Barbershop,
  SubscriptionStatus,
} from '../../../domain/entities/barbershop';
import { User } from '../../../domain/entities/user';
import { EmailAlreadyRegisteredError } from '../../../domain/errors/email-already-registered.error';
import { BarbershopRepository } from '../../../usecases/ports/barbershop.repository.port';
import { BarbershopEntity } from '../entities/barbershop.entity';
import { UserEntity } from '../entities/user.entity';
import { isEmailUniqueViolation } from './email-unique-violation';

export class TypeOrmBarbershopRepository implements BarbershopRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createWithOwner(barbershop: Barbershop, owner: User): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.insert(BarbershopEntity, {
          id: barbershop.id,
          name: barbershop.name,
          timezone: barbershop.timezone,
          subscriptionStatus: barbershop.subscriptionStatus,
          trialEndsAt: barbershop.trialEndsAt,
          createdAt: barbershop.createdAt,
        });
        await manager.insert(UserEntity, {
          id: owner.id,
          barbershopId: owner.barbershopId,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
          passwordHash: owner.passwordHash,
          role: owner.role,
          createdAt: owner.createdAt,
        });
      });
    } catch (error) {
      if (isEmailUniqueViolation(error)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }

  async findById(barbershopId: string): Promise<Barbershop | null> {
    const row = await this.dataSource
      .getRepository(BarbershopEntity)
      .findOneBy({ id: barbershopId });
    if (!row) return null;
    return Barbershop.restore({
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      subscriptionStatus: row.subscriptionStatus as SubscriptionStatus,
      trialEndsAt: row.trialEndsAt,
      createdAt: row.createdAt,
    });
  }
}

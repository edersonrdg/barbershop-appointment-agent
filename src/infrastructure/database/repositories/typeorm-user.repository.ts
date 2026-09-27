import { DataSource, Repository } from 'typeorm';
import { User, UserRole } from '../../../domain/entities/user';
import { UserRepository } from '../../../usecases/ports/user.repository.port';
import { UserEntity } from '../entities/user.entity';

function toDomain(row: UserEntity): User {
  return User.restore({
    id: row.id,
    barbershopId: row.barbershopId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.passwordHash,
    role: row.role as UserRole,
    createdAt: row.createdAt,
  });
}

export class TypeOrmUserRepository implements UserRepository {
  constructor(private readonly dataSource: DataSource) {}

  private get users(): Repository<UserEntity> {
    return this.dataSource.getRepository(UserEntity);
  }

  async findById(barbershopId: string, userId: string): Promise<User | null> {
    const row = await this.users.findOneBy({ id: userId, barbershopId });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.users.findOneBy({ email });
    return row ? toDomain(row) : null;
  }

  async listByBarbershop(barbershopId: string): Promise<User[]> {
    const rows = await this.users.find({
      where: { barbershopId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return rows.map(toDomain);
  }

  async removeBarber(barbershopId: string, userId: string): Promise<boolean> {
    const result = await this.users.delete({
      id: userId,
      barbershopId,
      role: 'barber',
    });
    return (result.affected ?? 0) > 0;
  }
}

import { DataSource } from 'typeorm';
import { Client } from '../../../domain/entities/client';
import { ClientRepository } from '../../../usecases/ports/client.repository.port';
import { ClientEntity } from '../entities/client.entity';

export class TypeOrmClientRepository implements ClientRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByPhone(
    barbershopId: string,
    phone: string,
  ): Promise<Client | null> {
    const row = await this.dataSource
      .getRepository(ClientEntity)
      .findOneBy({ barbershopId, phone });
    if (!row) return null;
    return Client.restore({
      id: row.id,
      barbershopId: row.barbershopId,
      name: row.name,
      phone: row.phone,
      createdAt: row.createdAt,
    });
  }
}

import { DataSource } from 'typeorm';
import { WhatsAppConnection } from '../../../domain/entities/whatsapp-connection';
import { WhatsAppConnectionRepository } from '../../../usecases/ports/whatsapp-connection.repository.port';
import { WhatsAppConnectionEntity } from '../entities/whatsapp-connection.entity';

export class TypeOrmWhatsAppConnectionRepository implements WhatsAppConnectionRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByBarbershopId(
    barbershopId: string,
  ): Promise<WhatsAppConnection | null> {
    const row = await this.dataSource
      .getRepository(WhatsAppConnectionEntity)
      .findOneBy({ barbershopId });
    return row ? WhatsAppConnection.restore(row) : null;
  }

  async save(connection: WhatsAppConnection): Promise<void> {
    await this.dataSource
      .getRepository(WhatsAppConnectionEntity)
      .upsert(toRow(connection), ['barbershopId']);
  }

  async recordDrop(connection: WhatsAppConnection): Promise<boolean> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(WhatsAppConnectionEntity)
      .set({
        status: connection.status,
        disconnectedAt: connection.disconnectedAt,
        updatedAt: connection.updatedAt,
      })
      .where('barbershop_id = :barbershopId AND status = :connected', {
        barbershopId: connection.barbershopId,
        connected: 'connected',
      })
      .execute();
    return result.affected === 1;
  }
}

function toRow(connection: WhatsAppConnection): WhatsAppConnectionEntity {
  return {
    barbershopId: connection.barbershopId,
    status: connection.status,
    disconnectedAt: connection.disconnectedAt,
    updatedAt: connection.updatedAt,
  };
}

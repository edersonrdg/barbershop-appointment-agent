import { DataSource } from 'typeorm';
import { InboundMessageRepository } from '../../../usecases/ports/inbound-message.repository.port';

export class TypeOrmInboundMessageRepository implements InboundMessageRepository {
  constructor(private readonly dataSource: DataSource) {}

  // The primary key decides which of two concurrent deliveries is answered.
  async claim(
    barbershopId: string,
    messageId: string,
    receivedAt: Date,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<{ message_id: string }[]>(
      `INSERT INTO whatsapp_inbound_messages (barbershop_id, message_id, received_at)
       VALUES ($1, $2, $3)
       ON CONFLICT ON CONSTRAINT "PK_whatsapp_inbound_messages" DO NOTHING
       RETURNING message_id`,
      [barbershopId, messageId, receivedAt],
    );
    return rows.length === 1;
  }
}

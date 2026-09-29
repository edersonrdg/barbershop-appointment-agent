import { WhatsAppConnection } from '../../domain/entities/whatsapp-connection';
import { WhatsAppConnectionRepository } from '../ports/whatsapp-connection.repository.port';

export class InMemoryWhatsAppConnectionRepository implements WhatsAppConnectionRepository {
  readonly rows = new Map<string, WhatsAppConnection>();

  findByBarbershopId(barbershopId: string): Promise<WhatsAppConnection | null> {
    return Promise.resolve(this.rows.get(barbershopId) ?? null);
  }

  save(connection: WhatsAppConnection): Promise<void> {
    this.rows.set(connection.barbershopId, connection);
    return Promise.resolve();
  }

  recordDrop(connection: WhatsAppConnection): Promise<boolean> {
    if (this.rows.get(connection.barbershopId)?.status !== 'connected') {
      return Promise.resolve(false);
    }
    this.rows.set(connection.barbershopId, connection);
    return Promise.resolve(true);
  }
}

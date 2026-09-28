import { Client } from '../../domain/entities/client';
import { ClientRepository } from '../ports/client.repository.port';

export class InMemoryClientRepository implements ClientRepository {
  private clients: Client[] = [];

  add(client: Client): void {
    this.clients.push(client);
  }

  list(barbershopId: string): Client[] {
    return this.clients.filter(
      (client) => client.barbershopId === barbershopId,
    );
  }

  findByPhone(barbershopId: string, phone: string): Promise<Client | null> {
    const found = this.clients.find(
      (client) =>
        client.barbershopId === barbershopId && client.phone === phone,
    );
    return Promise.resolve(found ?? null);
  }
}

import { Client } from '../../domain/entities/client';
import { ClientPhoneTakenError } from '../../domain/errors/client-phone-taken.error';
import { ClientRepository } from '../ports/client.repository.port';

// Refuses a second client with the same phone in the barbershop, like the
// clients_barbershop_phone_unique constraint does (RN-08).
export class InMemoryClientRepository implements ClientRepository {
  private clients: Client[] = [];

  add(client: Client): void {
    const taken = this.clients.some(
      (stored) =>
        stored.barbershopId === client.barbershopId &&
        stored.phone === client.phone,
    );
    if (taken) {
      throw new ClientPhoneTakenError();
    }
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

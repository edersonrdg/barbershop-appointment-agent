import { Client } from '../../domain/entities/client';
import { ClientPhoneTakenError } from '../../domain/errors/client-phone-taken.error';
import {
  ClientRepository,
  ClientSearch,
} from '../ports/client.repository.port';

// Refuses a second client with the same phone in the barbershop, like the
// clients_barbershop_phone_unique constraint does (RN-08).
export class InMemoryClientRepository implements ClientRepository {
  private clients: Client[] = [];
  private readonly barberLinks = new Set<string>();
  private readonly privacyNotices = new Map<string, Date>();
  readonly searches: ClientSearch[] = [];

  /** Seeds an appointment of `barberId` with the client, for `search`. */
  linkToBarber(barbershopId: string, clientId: string, barberId: string): void {
    this.barberLinks.add(`${barbershopId}:${clientId}:${barberId}`);
  }

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

  privacyNoticeOf(client: Client): Date | null {
    return this.privacyNotices.get(noticeKey(client)) ?? null;
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

  findById(barbershopId: string, clientId: string): Promise<Client | null> {
    const found = this.clients.find(
      (client) =>
        client.barbershopId === barbershopId && client.id === clientId,
    );
    return Promise.resolve(found ?? null);
  }

  search(barbershopId: string, search: ClientSearch): Promise<Client[]> {
    this.searches.push({ ...search });
    const name = search.name?.toLowerCase() ?? null;
    const matches = (client: Client): boolean => {
      if (name === null && search.phoneDigits === null) return true;
      return (
        (name !== null && client.name.toLowerCase().includes(name)) ||
        (search.phoneDigits !== null &&
          client.phone.includes(search.phoneDigits))
      );
    };
    return Promise.resolve(
      this.list(barbershopId)
        .filter(
          (client) =>
            search.barberId === null ||
            this.barberLinks.has(
              `${barbershopId}:${client.id}:${search.barberId}`,
            ),
        )
        .filter(matches)
        .sort(
          (a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
            a.id.localeCompare(b.id),
        )
        .slice(0, search.limit),
    );
  }

  createIfAbsent(client: Client): Promise<boolean> {
    const taken = this.clients.some(
      (stored) =>
        stored.barbershopId === client.barbershopId &&
        stored.phone === client.phone,
    );
    if (!taken) this.clients.push(client);
    return Promise.resolve(!taken);
  }

  claimPrivacyNotice(client: Client, sentAt: Date): Promise<boolean> {
    const key = noticeKey(client);
    if (this.privacyNotices.has(key)) return Promise.resolve(false);
    this.privacyNotices.set(key, sentAt);
    return Promise.resolve(true);
  }

  releasePrivacyNotice(client: Client, sentAt: Date): Promise<void> {
    const key = noticeKey(client);
    if (this.privacyNotices.get(key)?.getTime() === sentAt.getTime()) {
      this.privacyNotices.delete(key);
    }
    return Promise.resolve();
  }
}

function noticeKey(client: Client): string {
  return `${client.barbershopId}:${client.id}`;
}

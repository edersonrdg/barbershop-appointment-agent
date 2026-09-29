import { Client } from '../../domain/entities/client';
import { BarberRepository } from '../ports/barber.repository.port';
import { ClientRepository } from '../ports/client.repository.port';
import {
  BarberAccessPolicy,
  BarberAccessRequest,
} from '../shared/barber-access-policy';

const SEARCH_LIMIT = 50;
const PHONE_SEARCH_MIN_DIGITS = 4;

export type SearchClientsInput = BarberAccessRequest & { q?: string };

export class SearchClientsUseCase {
  private readonly access: BarberAccessPolicy;

  constructor(
    barbers: BarberRepository,
    private readonly clients: ClientRepository,
  ) {
    this.access = new BarberAccessPolicy(barbers);
  }

  // CA-12.3: a barber only reaches clients with an appointment of their own.
  async execute(input: SearchClientsInput): Promise<Client[]> {
    const barberId = await this.access.readScope(input);
    if (barberId === undefined) return [];
    const term = input.q ?? null;
    // Fewer digits than this match almost every area code and prefix.
    const digits = term?.replace(/\D/g, '') ?? '';
    return this.clients.search(input.barbershopId, {
      name: term,
      phoneDigits: digits.length >= PHONE_SEARCH_MIN_DIGITS ? digits : null,
      barberId,
      limit: SEARCH_LIMIT,
    });
  }
}

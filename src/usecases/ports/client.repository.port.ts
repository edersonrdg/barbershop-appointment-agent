import type { Client } from '../../domain/entities/client';

export const CLIENT_REPOSITORY = Symbol('ClientRepository');

export interface ClientRepository {
  /** The client of the barbershop with the E.164 `phone` (RN-08). */
  findByPhone(barbershopId: string, phone: string): Promise<Client | null>;
}

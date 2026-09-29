import type { Client } from '../../domain/entities/client';

export const CLIENT_REPOSITORY = Symbol('ClientRepository');

export interface ClientSearch {
  /** Case-insensitive part of the name, taken literally; `null` skips it. */
  name: string | null;
  /** Digits the E.164 phone must contain in this order; `null` skips it. */
  phoneDigits: string | null;
  /** Only clients with an appointment of this barber; `null` for any client. */
  barberId: string | null;
  limit: number;
}

export interface ClientRepository {
  /** The client of the barbershop with the E.164 `phone` (RN-08). */
  findByPhone(barbershopId: string, phone: string): Promise<Client | null>;
  /** The client of the barbershop, or `null` when it is not there (RN-26). */
  findById(barbershopId: string, clientId: string): Promise<Client | null>;
  /**
   * The clients of the barbershop whose name or phone matches `search` (any
   * client when both are null), ordered by case-insensitive name and id.
   */
  search(barbershopId: string, search: ClientSearch): Promise<Client[]>;
  /**
   * Stores the client unless the barbershop already has one with the same
   * phone; resolves to whether it was stored (RN-08).
   */
  createIfAbsent(client: Client): Promise<boolean>;
  /**
   * Records `sentAt` as the privacy notice of the client only while none is
   * recorded, so of two concurrent claims only one resolves to true (RN-20).
   */
  claimPrivacyNotice(client: Client, sentAt: Date): Promise<boolean>;
  /** Undoes the claim made at `sentAt`, so the next message tries again. */
  releasePrivacyNotice(client: Client, sentAt: Date): Promise<void>;
}

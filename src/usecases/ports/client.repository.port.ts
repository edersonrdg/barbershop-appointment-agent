import type { Client } from '../../domain/entities/client';

export const CLIENT_REPOSITORY = Symbol('ClientRepository');

/** US-25: where a client changed the return reminder (CA-25.5). */
export const CONSENT_CHANNELS = ['whatsapp'] as const;

export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

/** US-25: a change of the return reminder opt-in, kept as consent proof. */
export interface ReturnReminderChange {
  id: string;
  barbershopId: string;
  clientId: string;
  enabled: boolean;
  channel: ConsentChannel;
  recordedAt: Date;
}

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
  /**
   * US-25: stores `change.enabled` as the return reminder of the client and
   * records the change, atomically, only when the stored value differs; true
   * when this call changed it, so of two equal concurrent changes only one is
   * recorded (CA-25.5, RN-21).
   */
  changeReturnReminder(change: ReturnReminderChange): Promise<boolean>;
  /**
   * US-25: records `at` as when the client was asked about the return
   * reminder, only while it is off, they were never asked and no change was
   * ever recorded; true when this call recorded it (CA-25.1).
   */
  claimReturnReminderQuestion(
    barbershopId: string,
    clientId: string,
    at: Date,
  ): Promise<boolean>;
}

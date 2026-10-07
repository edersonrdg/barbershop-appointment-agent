import { WaitlistEntry } from '../../domain/entities/waitlist-entry';

export const WAITLIST_REPOSITORY = Symbol('WaitlistRepository');

export const WAITLIST_OFFER_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'expired',
] as const;

export type WaitlistOfferStatus = (typeof WAITLIST_OFFER_STATUSES)[number];

/** US-24: a freed slot (a cancelled appointment) offered to an entry. */
export interface WaitlistOffer {
  id: string;
  barbershopId: string;
  entryId: string;
  /** The cancelled appointment whose slot is offered. */
  appointmentId: string;
  barberId: string;
  startsAt: Date;
  expiresAt: Date;
  status: WaitlistOfferStatus;
}

// US-24 (door 1): every read and write is scoped to the barbershop (RN-26).
export interface WaitlistRepository {
  /** Stores the entry, replacing any entry of the same client. */
  join(entry: WaitlistEntry): Promise<void>;
  /** The entries of the barbershop, by creation instant and then id. */
  listEntries(barbershopId: string): Promise<WaitlistEntry[]>;
  /** Removes the entry and its offers. */
  removeEntry(barbershopId: string, entryId: string): Promise<void>;
  /** Removes the client's entry and its offers; true when there was one. */
  removeClientEntry(barbershopId: string, clientId: string): Promise<boolean>;
  /** Every offer of the barbershop's entries. */
  listOffers(barbershopId: string): Promise<WaitlistOffer[]>;
  findOffer(
    barbershopId: string,
    offerId: string,
  ): Promise<WaitlistOffer | null>;
  /**
   * Stores a pending offer unless the appointment or the entry already has a
   * pending one, or the entry already got this appointment; true when stored,
   * so of two concurrent runs only one offers (RN-15).
   */
  createOffer(offer: WaitlistOffer): Promise<boolean>;
  /** Marks `expired` every pending offer whose deadline is at or before `now`. */
  expireOffers(barbershopId: string, now: Date): Promise<number>;
  /**
   * Marks a pending offer `accepted` while `now` is before its deadline, or
   * `declined`; true when this call changed it.
   */
  resolveOffer(
    barbershopId: string,
    offerId: string,
    status: 'accepted' | 'declined',
    now: Date,
  ): Promise<boolean>;
}

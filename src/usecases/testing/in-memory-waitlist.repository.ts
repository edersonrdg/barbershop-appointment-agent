import { WaitlistEntry } from '../../domain/entities/waitlist-entry';
import {
  WaitlistOffer,
  WaitlistRepository,
} from '../ports/waitlist.repository.port';

export class InMemoryWaitlistRepository implements WaitlistRepository {
  readonly entries: WaitlistEntry[] = [];
  readonly offers: WaitlistOffer[] = [];
  failingBarbershops = new Set<string>();

  join(entry: WaitlistEntry): Promise<void> {
    const previous = this.entries.find(
      (stored) =>
        stored.barbershopId === entry.barbershopId &&
        stored.clientId === entry.clientId,
    );
    if (previous) this.drop(previous.id);
    this.entries.push(entry);
    return Promise.resolve();
  }

  listEntries(barbershopId: string): Promise<WaitlistEntry[]> {
    if (this.failingBarbershops.has(barbershopId)) {
      return Promise.reject(new Error('waitlist unavailable'));
    }
    return Promise.resolve(
      this.entries
        .filter((entry) => entry.barbershopId === barbershopId)
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id),
        ),
    );
  }

  removeEntry(barbershopId: string, entryId: string): Promise<void> {
    const entry = this.entries.find(
      (stored) => stored.barbershopId === barbershopId && stored.id === entryId,
    );
    if (entry) this.drop(entry.id);
    return Promise.resolve();
  }

  removeClientEntry(barbershopId: string, clientId: string): Promise<boolean> {
    const entry = this.entries.find(
      (stored) =>
        stored.barbershopId === barbershopId && stored.clientId === clientId,
    );
    if (!entry) return Promise.resolve(false);
    this.drop(entry.id);
    return Promise.resolve(true);
  }

  listOffers(barbershopId: string): Promise<WaitlistOffer[]> {
    return Promise.resolve(
      this.offers
        .filter((offer) => offer.barbershopId === barbershopId)
        .map((offer) => ({ ...offer })),
    );
  }

  findOffer(
    barbershopId: string,
    offerId: string,
  ): Promise<WaitlistOffer | null> {
    const offer = this.offers.find(
      (stored) => stored.barbershopId === barbershopId && stored.id === offerId,
    );
    return Promise.resolve(offer ? { ...offer } : null);
  }

  createOffer(offer: WaitlistOffer): Promise<boolean> {
    const taken = this.offers.some(
      (stored) =>
        stored.barbershopId === offer.barbershopId &&
        ((stored.status === 'pending' &&
          (stored.appointmentId === offer.appointmentId ||
            stored.entryId === offer.entryId)) ||
          (stored.entryId === offer.entryId &&
            stored.appointmentId === offer.appointmentId)),
    );
    if (taken) return Promise.resolve(false);
    this.offers.push({ ...offer });
    return Promise.resolve(true);
  }

  expireOffers(barbershopId: string, now: Date): Promise<number> {
    let count = 0;
    for (const offer of this.offers) {
      if (
        offer.barbershopId === barbershopId &&
        offer.status === 'pending' &&
        offer.expiresAt <= now
      ) {
        offer.status = 'expired';
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  resolveOffer(
    barbershopId: string,
    offerId: string,
    status: 'accepted' | 'declined',
    now: Date,
  ): Promise<boolean> {
    const offer = this.offers.find(
      (stored) => stored.barbershopId === barbershopId && stored.id === offerId,
    );
    if (offer?.status !== 'pending') return Promise.resolve(false);
    if (status === 'accepted' && offer.expiresAt <= now) {
      return Promise.resolve(false);
    }
    offer.status = status;
    return Promise.resolve(true);
  }

  private drop(entryId: string): void {
    this.entries.splice(
      this.entries.findIndex((entry) => entry.id === entryId),
      1,
    );
    for (let index = this.offers.length - 1; index >= 0; index -= 1) {
      if (this.offers[index].entryId === entryId) this.offers.splice(index, 1);
    }
  }
}

import { BookingRules } from '../../domain/value-objects/booking-rules';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { InMemoryAccountStore } from './in-memory-account-store';

export class InMemoryBookingRulesRepository implements BookingRulesRepository {
  constructor(private readonly store: InMemoryAccountStore) {}

  findByBarbershopId(barbershopId: string): Promise<BookingRules | null> {
    return Promise.resolve(this.store.bookingRules.get(barbershopId) ?? null);
  }

  save(barbershopId: string, rules: BookingRules): Promise<void> {
    if (this.store.bookingRules.has(barbershopId)) {
      this.store.bookingRules.set(barbershopId, rules);
    }
    return Promise.resolve();
  }
}

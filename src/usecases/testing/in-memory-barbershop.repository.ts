import { Barbershop } from '../../domain/entities/barbershop';
import { User } from '../../domain/entities/user';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { InMemoryAccountStore } from './in-memory-account-store';

export class InMemoryBarbershopRepository implements BarbershopRepository {
  constructor(private readonly store: InMemoryAccountStore) {}

  createWithOwner(
    barbershop: Barbershop,
    owner: User,
    bookingRules: BookingRules,
  ): Promise<void> {
    if (this.store.users.some((user) => user.email === owner.email)) {
      return Promise.reject(new EmailAlreadyRegisteredError());
    }
    this.store.barbershops.push(barbershop);
    this.store.users.push(owner);
    this.store.bookingRules.set(barbershop.id, bookingRules);
    return Promise.resolve();
  }

  findById(barbershopId: string): Promise<Barbershop | null> {
    const found = this.store.barbershops.find(
      (barbershop) => barbershop.id === barbershopId,
    );
    return Promise.resolve(found ?? null);
  }

  saveSettings(barbershop: Barbershop): Promise<void> {
    const index = this.store.barbershops.findIndex(
      (stored) => stored.id === barbershop.id,
    );
    if (index !== -1) {
      this.store.barbershops[index] = barbershop;
    }
    return Promise.resolve();
  }
}

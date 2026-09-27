import { User } from '../../domain/entities/user';
import { UserRepository } from '../ports/user.repository.port';
import { InMemoryAccountStore } from './in-memory-account-store';

export class InMemoryUserRepository implements UserRepository {
  constructor(private readonly store: InMemoryAccountStore) {}

  findById(barbershopId: string, userId: string): Promise<User | null> {
    const found = this.store.users.find(
      (user) => user.barbershopId === barbershopId && user.id === userId,
    );
    return Promise.resolve(found ?? null);
  }

  findByEmail(email: string): Promise<User | null> {
    const found = this.store.users.find((user) => user.email === email);
    return Promise.resolve(found ?? null);
  }

  listByBarbershop(barbershopId: string): Promise<User[]> {
    return Promise.resolve(
      this.store.users.filter((user) => user.barbershopId === barbershopId),
    );
  }

  removeBarber(barbershopId: string, userId: string): Promise<boolean> {
    const before = this.store.users.length;
    this.store.users = this.store.users.filter(
      (user) =>
        user.barbershopId !== barbershopId ||
        user.id !== userId ||
        user.role !== 'barber',
    );
    return Promise.resolve(this.store.users.length < before);
  }
}

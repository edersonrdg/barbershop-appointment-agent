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
}

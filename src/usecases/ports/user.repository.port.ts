import { User } from '../../domain/entities/user';

export const USER_REPOSITORY = Symbol('UserRepository');

export interface UserRepository {
  findById(barbershopId: string, userId: string): Promise<User | null>;
  // RN-26 exception (AD-004): login happens before a session exists, so the
  // tenant comes from the user found by the normalized e-mail.
  findByEmail(email: string): Promise<User | null>;
  listByBarbershop(barbershopId: string): Promise<User[]>;
  // Deletes only a barber of the given barbershop; returns false otherwise.
  removeBarber(barbershopId: string, userId: string): Promise<boolean>;
}

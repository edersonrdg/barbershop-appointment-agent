import { Barbershop } from '../../domain/entities/barbershop';
import { User } from '../../domain/entities/user';

export const BARBERSHOP_REPOSITORY = Symbol('BarbershopRepository');

export interface BarbershopRepository {
  /**
   * Persists the barbershop and its owner atomically. Throws
   * `EmailAlreadyRegisteredError` when the owner's e-mail is taken, and then
   * nothing is persisted.
   */
  createWithOwner(barbershop: Barbershop, owner: User): Promise<void>;
  findById(barbershopId: string): Promise<Barbershop | null>;
}

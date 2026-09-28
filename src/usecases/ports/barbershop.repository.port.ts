import { Barbershop } from '../../domain/entities/barbershop';
import { User } from '../../domain/entities/user';
import { BookingRules } from '../../domain/value-objects/booking-rules';

export const BARBERSHOP_REPOSITORY = Symbol('BarbershopRepository');

export interface BarbershopRepository {
  /**
   * Persists the barbershop, its owner and its booking rules atomically.
   * Throws `EmailAlreadyRegisteredError` when the owner's e-mail is taken, and
   * then nothing is persisted.
   */
  createWithOwner(
    barbershop: Barbershop,
    owner: User,
    bookingRules: BookingRules,
  ): Promise<void>;
  findById(barbershopId: string): Promise<Barbershop | null>;
  /**
   * Replaces the name, address, timezone and weekly opening hours of the
   * barbershop atomically: either everything is saved or nothing changes.
   */
  saveSettings(barbershop: Barbershop): Promise<void>;
}

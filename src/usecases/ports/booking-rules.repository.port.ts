import { BookingRules } from '../../domain/value-objects/booking-rules';

export const BOOKING_RULES_REPOSITORY = Symbol('BookingRulesRepository');

export interface BookingRulesRepository {
  /** The rules in force for the barbershop, or `null` when it has none. */
  findByBarbershopId(barbershopId: string): Promise<BookingRules | null>;
  /**
   * Replaces the five rules of the barbershop atomically. Writes nothing else:
   * the barbershop row and every other table stay as they were.
   */
  save(barbershopId: string, rules: BookingRules): Promise<void>;
}

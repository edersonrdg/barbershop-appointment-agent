import { Barber } from '../../domain/entities/barber';

export const BARBER_REPOSITORY = Symbol('BarberRepository');

export interface BarberRepository {
  /** Every barber of the barbershop, active or not, by case-insensitive name. */
  listByBarbershop(barbershopId: string): Promise<Barber[]>;
  /** Only the active barbers, in the same order as `listByBarbershop`. */
  listActiveByBarbershop(barbershopId: string): Promise<Barber[]>;
  findById(barbershopId: string, barberId: string): Promise<Barber | null>;
  /** The barber linked to the user in the barbershop, if any. */
  findByUserId(barbershopId: string, userId: string): Promise<Barber | null>;
  /**
   * Persists the barber, its services and its working hours atomically.
   * Throws `BarberNameAlreadyExistsError` when the barbershop already has the
   * name (case-insensitive) and `BarberUserAlreadyLinkedError` when the user
   * is linked to another barber; then nothing is persisted.
   */
  create(barber: Barber): Promise<void>;
  /**
   * Replaces name, user, active, services and working hours atomically. Throws
   * `BarberNotFoundError` when the barber is not in its barbershop, and the
   * errors of `create`; then nothing changes.
   */
  save(barber: Barber): Promise<void>;
}

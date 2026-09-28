import { BarbershopService } from '../../domain/entities/barbershop-service';

export const SERVICE_REPOSITORY = Symbol('ServiceRepository');

export interface ServiceRepository {
  /** Every service of the barbershop, active or not, by case-insensitive name. */
  listByBarbershop(barbershopId: string): Promise<BarbershopService[]>;
  /** Only the active services, in the same order as `listByBarbershop`. */
  listActiveByBarbershop(barbershopId: string): Promise<BarbershopService[]>;
  findById(
    barbershopId: string,
    serviceId: string,
  ): Promise<BarbershopService | null>;
  /** The services of the barbershop among `serviceIds`; unknown ids are left out. */
  findByIds(
    barbershopId: string,
    serviceIds: readonly string[],
  ): Promise<BarbershopService[]>;
  /**
   * Persists the service and its add-ons atomically. Throws
   * `ServiceNameAlreadyExistsError` when the barbershop already has the name
   * (case-insensitive), and then nothing is persisted.
   */
  create(service: BarbershopService): Promise<void>;
  /**
   * Replaces name, price, duration, active and the add-on list atomically.
   * Throws `ServiceNameAlreadyExistsError` like `create`, and then nothing
   * changes.
   */
  save(service: BarbershopService): Promise<void>;
}

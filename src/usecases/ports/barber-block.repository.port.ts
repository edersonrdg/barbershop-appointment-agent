import { UtcPeriod } from '../../domain/entities/barbershop';
import { BusyPeriod } from './appointment.repository.port';

export const BARBER_BLOCK_REPOSITORY = Symbol('BarberBlockRepository');

export interface BarberBlockRepository {
  /**
   * The blocks and days off of the barbers among `barberIds` in the
   * barbershop whose `[start, end)` overlaps `range`; touching ones are left out.
   */
  listBusyPeriods(
    barbershopId: string,
    barberIds: readonly string[],
    range: UtcPeriod,
  ): Promise<BusyPeriod[]>;
}

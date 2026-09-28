import { UtcPeriod } from '../../domain/entities/barbershop';

export const APPOINTMENT_REPOSITORY = Symbol('AppointmentRepository');

export interface BusyPeriod {
  barberId: string;
  start: Date;
  end: Date;
}

export interface AppointmentRepository {
  /**
   * The confirmed appointments of the barbers among `barberIds` in the
   * barbershop whose `[start, end)` overlaps `range`; touching ones are left out.
   */
  listBusyPeriods(
    barbershopId: string,
    barberIds: readonly string[],
    range: UtcPeriod,
  ): Promise<BusyPeriod[]>;
}

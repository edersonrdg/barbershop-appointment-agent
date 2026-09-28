import { Appointment } from '../../domain/entities/appointment';
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
  /**
   * Persists the appointment and its services atomically. Throws
   * `AppointmentConflictError` (RN-07) when the database refuses a confirmed
   * appointment overlapping another of the same barber; then nothing is
   * persisted.
   */
  create(appointment: Appointment): Promise<void>;
}

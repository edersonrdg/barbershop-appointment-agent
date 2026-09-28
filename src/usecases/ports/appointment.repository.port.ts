import { Appointment } from '../../domain/entities/appointment';
import { UtcPeriod } from '../../domain/entities/barbershop';
import type { Client } from '../../domain/entities/client';

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
   * Persists `newClient` (when given), the appointment and its services
   * atomically. Throws `AppointmentConflictError` (RN-07) when the database
   * refuses a confirmed appointment overlapping another of the same barber,
   * and `ClientPhoneTakenError` (RN-08) when the barbershop already has a
   * client with the phone of `newClient`; then nothing is persisted.
   */
  create(appointment: Appointment, newClient?: Client | null): Promise<void>;
}

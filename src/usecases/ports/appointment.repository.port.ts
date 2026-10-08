import { Appointment } from '../../domain/entities/appointment';
import { UtcPeriod } from '../../domain/entities/barbershop';
import type { Client } from '../../domain/entities/client';
import type { ReminderKind } from '../../domain/value-objects/appointment-reminder';

export const APPOINTMENT_REPOSITORY = Symbol('AppointmentRepository');

export interface BusyPeriod {
  barberId: string;
  start: Date;
  end: Date;
}

export interface AppointmentRepository {
  /**
   * The confirmed, attended and no-show appointments (all hold the slot, RN-03)
   * of the barbers among `barberIds` in the barbershop whose `[start, end)`
   * overlaps `range`; touching ones are left out.
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
  /**
   * The appointment of the barbershop with its services in the booked order,
   * or `null` when it does not exist there (RN-26).
   */
  findById(
    barbershopId: string,
    appointmentId: string,
  ): Promise<Appointment | null>;
  /**
   * Stores the status of `appointment`, matching both its id and its
   * barbershop; nothing else of the appointment changes (RF-27).
   */
  saveStatus(appointment: Appointment): Promise<void>;
  /**
   * Records that the `kind` reminder of the appointment went out at `now`,
   * only while it is confirmed and that reminder was never recorded; true when
   * this call recorded it, so of two concurrent runs only one sends (US-19).
   */
  claimReminder(
    barbershopId: string,
    appointmentId: string,
    kind: ReminderKind,
    now: Date,
  ): Promise<boolean>;
  /**
   * Records that the client confirmed the appointment at `now`, only while it
   * is confirmed, got the 24h reminder and was not confirmed before; true when
   * this call recorded it (CA-19.2).
   */
  confirmByClient(
    barbershopId: string,
    appointmentId: string,
    now: Date,
  ): Promise<boolean>;
  /**
   * Records that the return reminder of the attended appointment went out at
   * `now`, only while it was never recorded; true when this call recorded it,
   * so of two concurrent runs only one sends (US-25, RN-19).
   */
  claimReturnReminder(
    barbershopId: string,
    appointmentId: string,
    now: Date,
  ): Promise<boolean>;
}

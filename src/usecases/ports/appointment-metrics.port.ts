import { AppointmentOrigin } from '../../domain/entities/appointment';

export const APPOINTMENT_METRICS = Symbol('AppointmentMetrics');

export interface AppointmentMetrics {
  booked(origin: AppointmentOrigin): void;
  conflict(origin: AppointmentOrigin): void;
}

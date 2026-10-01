import { AppointmentOrigin } from '../../domain/entities/appointment';
import { AppointmentMetrics } from '../ports/appointment-metrics.port';

export class CountingAppointmentMetrics implements AppointmentMetrics {
  readonly bookings: AppointmentOrigin[] = [];
  readonly conflicts: AppointmentOrigin[] = [];
  readonly cancellations: AppointmentOrigin[] = [];

  booked(origin: AppointmentOrigin): void {
    this.bookings.push(origin);
  }

  conflict(origin: AppointmentOrigin): void {
    this.conflicts.push(origin);
  }

  cancelled(origin: AppointmentOrigin): void {
    this.cancellations.push(origin);
  }
}

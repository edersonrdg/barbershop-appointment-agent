import { Appointment } from '../../domain/entities/appointment';
import { UtcPeriod } from '../../domain/entities/barbershop';
import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import {
  AppointmentRepository,
  BusyPeriod,
} from '../ports/appointment.repository.port';

// Stores snapshots and refuses overlapping confirmed appointments of the same
// barber, like the database exclusion constraint does.
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private appointments: Appointment[] = [];

  seed({
    barbershopId,
    barberId,
    start,
    end,
  }: {
    barbershopId: string;
    barberId: string;
    start: Date;
    end: Date;
  }): void {
    this.appointments.push(
      Appointment.restore({
        id: `seeded-${this.appointments.length + 1}`,
        barbershopId,
        barberId,
        serviceIds: ['haircut'],
        startsAt: start,
        endsAt: end,
        status: 'confirmed',
        origin: 'manual',
        createdAt: start,
      }),
    );
  }

  create(appointment: Appointment): Promise<void> {
    const overlapping = this.appointments.some(
      (stored) =>
        stored.status === 'confirmed' &&
        stored.barbershopId === appointment.barbershopId &&
        stored.barberId === appointment.barberId &&
        stored.startsAt < appointment.endsAt &&
        appointment.startsAt < stored.endsAt,
    );
    if (overlapping) {
      return Promise.reject(new AppointmentConflictError('RN-07'));
    }
    this.appointments.push(snapshot(appointment));
    return Promise.resolve();
  }

  list(barbershopId: string): Promise<Appointment[]> {
    return Promise.resolve(
      this.appointments
        .filter((appointment) => appointment.barbershopId === barbershopId)
        .map(snapshot),
    );
  }

  listBusyPeriods(
    barbershopId: string,
    barberIds: readonly string[],
    range: UtcPeriod,
  ): Promise<BusyPeriod[]> {
    return Promise.resolve(
      this.appointments
        .filter(
          (appointment) =>
            appointment.barbershopId === barbershopId &&
            appointment.status === 'confirmed' &&
            barberIds.includes(appointment.barberId) &&
            appointment.startsAt < range.end &&
            range.start < appointment.endsAt,
        )
        .map((appointment) => ({
          barberId: appointment.barberId,
          start: appointment.startsAt,
          end: appointment.endsAt,
        })),
    );
  }
}

function snapshot(appointment: Appointment): Appointment {
  return Appointment.restore({
    id: appointment.id,
    barbershopId: appointment.barbershopId,
    barberId: appointment.barberId,
    serviceIds: [...appointment.serviceIds],
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    status: appointment.status,
    origin: appointment.origin,
    createdAt: appointment.createdAt,
  });
}

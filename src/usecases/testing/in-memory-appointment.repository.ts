import { Appointment } from '../../domain/entities/appointment';
import { UtcPeriod } from '../../domain/entities/barbershop';
import {
  AppointmentRepository,
  BusyPeriod,
} from '../ports/appointment.repository.port';

// Stores snapshots, like a database would.
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

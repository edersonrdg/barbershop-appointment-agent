import { Appointment } from '../../domain/entities/appointment';
import { UtcPeriod } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { ClientPhoneTakenError } from '../../domain/errors/client-phone-taken.error';
import {
  AppointmentRepository,
  BusyPeriod,
} from '../ports/appointment.repository.port';
import { InMemoryClientRepository } from './in-memory-client.repository';

// Stores snapshots and refuses overlapping confirmed appointments of the same
// barber, like the database exclusion constraint does. The new client is
// stored only when the appointment is, as in the database transaction.
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private appointments: Appointment[] = [];
  private racingClients: Client[] = [];

  constructor(
    private readonly clients: InMemoryClientRepository = new InMemoryClientRepository(),
  ) {}

  /**
   * Simulates another request storing `client` between the phone lookup and
   * the next `create` (RN-08 race).
   */
  storeClientBeforeNextCreate(client: Client): void {
    this.racingClients.push(client);
  }

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
        clientId: null,
        serviceIds: ['haircut'],
        startsAt: start,
        endsAt: end,
        status: 'confirmed',
        origin: 'manual',
        createdAt: start,
      }),
    );
  }

  create(
    appointment: Appointment,
    newClient: Client | null = null,
  ): Promise<void> {
    for (const racing of this.racingClients.splice(0)) {
      this.clients.add(racing);
    }
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
    if (newClient) {
      const taken = this.clients
        .list(newClient.barbershopId)
        .some((client) => client.phone === newClient.phone);
      if (taken) {
        return Promise.reject(new ClientPhoneTakenError());
      }
      this.clients.add(newClient);
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
    clientId: appointment.clientId,
    serviceIds: [...appointment.serviceIds],
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    status: appointment.status,
    origin: appointment.origin,
    createdAt: appointment.createdAt,
  });
}

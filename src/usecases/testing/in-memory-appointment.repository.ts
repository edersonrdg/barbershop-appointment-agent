import {
  Appointment,
  AppointmentProps,
  AppointmentStatus,
} from '../../domain/entities/appointment';
import { UtcPeriod } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { ClientPhoneTakenError } from '../../domain/errors/client-phone-taken.error';
import {
  AppointmentRepository,
  BusyPeriod,
} from '../ports/appointment.repository.port';
import { InMemoryClientRepository } from './in-memory-client.repository';

const SLOT_HOLDING_STATUSES: readonly AppointmentStatus[] = [
  'confirmed',
  'attended',
  'no_show',
];

// Stores snapshots and refuses overlapping appointments of the same barber
// that hold the slot (RN-03), like the database exclusion constraint does. The new client is
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
        SLOT_HOLDING_STATUSES.includes(stored.status) &&
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

  findById(
    barbershopId: string,
    appointmentId: string,
  ): Promise<Appointment | null> {
    const stored = this.appointments.find(
      (appointment) =>
        appointment.id === appointmentId &&
        appointment.barbershopId === barbershopId,
    );
    return Promise.resolve(stored ? snapshot(stored) : null);
  }

  saveStatus(appointment: Appointment): Promise<void> {
    this.appointments = this.appointments.map((stored) =>
      stored.id === appointment.id &&
      stored.barbershopId === appointment.barbershopId
        ? Appointment.restore({
            ...toProps(stored),
            status: appointment.status,
          })
        : stored,
    );
    return Promise.resolve();
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
            SLOT_HOLDING_STATUSES.includes(appointment.status) &&
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
  return Appointment.restore(toProps(appointment));
}

function toProps(appointment: Appointment): AppointmentProps {
  return {
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
  };
}

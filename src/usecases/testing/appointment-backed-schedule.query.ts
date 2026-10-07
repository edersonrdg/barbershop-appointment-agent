import { Appointment } from '../../domain/entities/appointment';
import { UtcPeriod } from '../../domain/entities/barbershop';
import { ReminderKind } from '../../domain/value-objects/appointment-reminder';
import {
  PendingReminder,
  ScheduleEntry,
  ScheduleQuery,
} from '../ports/schedule.query.port';
import { InMemoryAppointmentRepository } from './in-memory-appointment.repository';
import { InMemoryBarberRepository } from './in-memory-barber.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryServiceRepository } from './in-memory-service.repository';

// Reads the client's appointments from the in-memory repository, so a status
// saved by a use case shows up in the next listing, as in the database.
export class AppointmentBackedScheduleQuery implements ScheduleQuery {
  constructor(
    private readonly appointments: InMemoryAppointmentRepository,
    private readonly barbers: InMemoryBarberRepository,
    private readonly services: InMemoryServiceRepository,
    private readonly clients: InMemoryClientRepository,
  ) {}

  async listForClient(
    barbershopId: string,
    clientId: string,
    barberId: string | null,
  ): Promise<ScheduleEntry[]> {
    const stored = (await this.appointments.list(barbershopId)).filter(
      (appointment) =>
        appointment.clientId === clientId &&
        (barberId === null || appointment.barberId === barberId),
    );
    return this.toEntries(barbershopId, stored);
  }

  // US-19: the same filter as the database query, from the stored marks.
  async listPendingReminders(
    barbershopId: string,
    kind: ReminderKind,
    after: Date,
    until: Date,
  ): Promise<PendingReminder[]> {
    const mark = kind === '24h' ? 'reminder24hSentAt' : 'reminder1hSentAt';
    const stored = (await this.appointments.list(barbershopId)).filter(
      (appointment) =>
        appointment.status === 'confirmed' &&
        appointment.clientId !== null &&
        this.appointments.marksOf(barbershopId, appointment.id)[mark] ===
          null &&
        appointment.startsAt > after &&
        appointment.startsAt <= until,
    );
    const entries = await this.toEntries(barbershopId, stored);
    return entries.flatMap((entry) => {
      const appointment = stored.find(({ id }) => id === entry.id);
      return appointment
        ? [{ ...entry, createdAt: appointment.createdAt }]
        : [];
    });
  }

  private async toEntries(
    barbershopId: string,
    appointments: Appointment[],
  ): Promise<ScheduleEntry[]> {
    const sorted = [...appointments].sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
    );
    const entries: ScheduleEntry[] = [];
    for (const appointment of sorted) {
      const client =
        appointment.clientId === null
          ? null
          : await this.clients.findById(barbershopId, appointment.clientId);
      const marks = this.appointments.marksOf(barbershopId, appointment.id);
      const barber = await this.barbers.findById(
        barbershopId,
        appointment.barberId,
      );
      const services = await this.services.findByIds(
        barbershopId,
        appointment.serviceIds,
      );
      entries.push({
        id: appointment.id,
        barber: { id: appointment.barberId, name: barber?.name ?? '' },
        client: client && {
          id: client.id,
          name: client.name,
          phone: client.phone,
        },
        services: appointment.serviceIds.flatMap((id) => {
          const service = services.find((candidate) => candidate.id === id);
          return service ? [{ id, name: service.name }] : [];
        }),
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        origin: appointment.origin,
        reminder24hSentAt: marks.reminder24hSentAt,
        clientConfirmedAt: marks.clientConfirmedAt,
      });
    }
    return entries;
  }

  // US-24: the same filter as the database query.
  async listStartingIn(
    barbershopId: string,
    range: UtcPeriod,
    barberId: string | null,
  ): Promise<ScheduleEntry[]> {
    const stored = (await this.appointments.list(barbershopId)).filter(
      (appointment) =>
        appointment.startsAt >= range.start &&
        appointment.startsAt < range.end &&
        (barberId === null || appointment.barberId === barberId),
    );
    return this.toEntries(barbershopId, stored);
  }

  listOverlapping(): never {
    throw new Error('not used by the WhatsApp booking tests');
  }

  findById(): never {
    throw new Error('not used by the WhatsApp booking tests');
  }
}

import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';
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
    const client = await this.clients.findById(barbershopId, clientId);
    const stored = (await this.appointments.list(barbershopId))
      .filter(
        (appointment) =>
          appointment.clientId === clientId &&
          (barberId === null || appointment.barberId === barberId),
      )
      .sort(
        (a, b) =>
          a.startsAt.getTime() - b.startsAt.getTime() ||
          a.id.localeCompare(b.id),
      );
    const entries: ScheduleEntry[] = [];
    for (const appointment of stored) {
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
      });
    }
    return entries;
  }

  listStartingIn(): never {
    throw new Error('not used by the WhatsApp booking tests');
  }

  listOverlapping(): never {
    throw new Error('not used by the WhatsApp booking tests');
  }

  findById(): never {
    throw new Error('not used by the WhatsApp booking tests');
  }
}

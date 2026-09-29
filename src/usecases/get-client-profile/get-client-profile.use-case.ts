import { Client } from '../../domain/entities/client';
import { ClientNotFoundError } from '../../domain/errors/client-not-found.error';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { ClientRepository } from '../ports/client.repository.port';
import { Clock } from '../ports/clock.port';
import { NoShowLedger } from '../ports/no-show-ledger.port';
import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';
import {
  BarberAccessPolicy,
  BarberAccessRequest,
} from '../shared/barber-access-policy';
import { clientNoShowStatus } from '../shared/client-no-show-status';

const TOP_SERVICES_LIMIT = 3;

export type GetClientProfileInput = BarberAccessRequest & { clientId: string };

export interface TopService {
  id: string;
  name: string;
  count: number;
}

export interface ClientProfile {
  client: Client;
  timezone: string;
  noShowCount: number;
  selfBookingBlocked: boolean;
  pastAppointments: ScheduleEntry[];
  upcomingAppointments: ScheduleEntry[];
  topServices: TopService[];
}

export class GetClientProfileUseCase {
  private readonly access: BarberAccessPolicy;

  constructor(
    private readonly barbershops: BarbershopRepository,
    barbers: BarberRepository,
    private readonly clients: ClientRepository,
    private readonly schedule: ScheduleQuery,
    private readonly ledger: NoShowLedger,
    private readonly bookingRules: BookingRulesRepository,
    private readonly clock: Clock,
  ) {
    this.access = new BarberAccessPolicy(barbers);
  }

  async execute(input: GetClientProfileInput): Promise<ClientProfile> {
    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new InvalidCredentialsError();
    }
    const barberId = await this.access.readScope(input);
    if (barberId === undefined) {
      throw new ClientNotFoundError();
    }
    const client = await this.clients.findById(
      input.barbershopId,
      input.clientId,
    );
    if (!client) {
      throw new ClientNotFoundError();
    }
    const appointments = await this.schedule.listForClient(
      input.barbershopId,
      client.id,
      barberId,
    );
    // CA-12.3: a client without an appointment of the barber is not theirs to
    // see, and answers as if it did not exist.
    if (barberId !== null && appointments.length === 0) {
      throw new ClientNotFoundError();
    }
    const now = this.clock.now();
    return {
      client,
      timezone: barbershop.timezone,
      ...(await clientNoShowStatus(
        this.ledger,
        this.bookingRules,
        input.barbershopId,
        client.id,
      )),
      pastAppointments: appointments
        .filter((appointment) => appointment.startsAt <= now)
        .reverse(),
      upcomingAppointments: appointments.filter(
        (appointment) => appointment.startsAt > now,
      ),
      topServices: topServicesOf(appointments),
    };
  }
}

// A no-show or a future appointment is not a service the client used.
function topServicesOf(appointments: ScheduleEntry[]): TopService[] {
  const counts = new Map<string, TopService>();
  for (const appointment of appointments) {
    if (appointment.status !== 'attended') continue;
    const seen = new Set<string>();
    for (const service of appointment.services) {
      if (seen.has(service.id)) continue;
      seen.add(service.id);
      const current = counts.get(service.id) ?? { ...service, count: 0 };
      counts.set(service.id, { ...current, count: current.count + 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, TOP_SERVICES_LIMIT);
}

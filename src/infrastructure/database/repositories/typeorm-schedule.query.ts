import { DataSource } from 'typeorm';
import type {
  AppointmentOrigin,
  AppointmentStatus,
} from '../../../domain/entities/appointment';
import { UtcPeriod } from '../../../domain/entities/barbershop';
import {
  ScheduleEntry,
  ScheduleQuery,
} from '../../../usecases/ports/schedule.query.port';

interface AppointmentRow {
  id: string;
  starts_at: Date;
  ends_at: Date;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  barber_id: string;
  barber_name: string;
  client: ScheduleEntry['client'];
}

interface ServiceRow {
  appointment_id: string;
  id: string;
  name: string;
}

const SELECT_APPOINTMENTS = `SELECT a.id, a.starts_at, a.ends_at, a.status, a.origin,
              b.id AS barber_id, b.name AS barber_name,
              CASE WHEN c.id IS NULL THEN NULL
                   ELSE json_build_object('id', c.id, 'name', c.name, 'phone', c.phone)
              END AS client
       FROM appointments a
       JOIN barbers b ON b.id = a.barber_id AND b.barbershop_id = a.barbershop_id
       LEFT JOIN clients c ON c.id = a.client_id AND c.barbershop_id = a.barbershop_id`;

// Every join also matches barbershop_id, so a row of another barbershop never
// reaches the schedule (RN-26).
export class TypeOrmScheduleQuery implements ScheduleQuery {
  constructor(private readonly dataSource: DataSource) {}

  async listStartingIn(
    barbershopId: string,
    range: UtcPeriod,
    barberId: string | null,
  ): Promise<ScheduleEntry[]> {
    const rows = await this.dataSource.query<AppointmentRow[]>(
      `${SELECT_APPOINTMENTS}
       WHERE a.barbershop_id = $1
         AND a.starts_at >= $2 AND a.starts_at < $3
         AND ($4::uuid IS NULL OR a.barber_id = $4::uuid)
       ORDER BY a.starts_at, lower(b.name), a.id`,
      [barbershopId, range.start, range.end, barberId],
    );
    return this.withServices(barbershopId, rows);
  }

  async listOverlapping(
    barbershopId: string,
    barberId: string,
    range: UtcPeriod,
  ): Promise<ScheduleEntry[]> {
    const rows = await this.dataSource.query<AppointmentRow[]>(
      `${SELECT_APPOINTMENTS}
       WHERE a.barbershop_id = $1
         AND a.barber_id = $2
         AND a.status = 'confirmed'
         AND a.starts_at < $4 AND a.ends_at > $3
       ORDER BY a.starts_at, a.id`,
      [barbershopId, barberId, range.start, range.end],
    );
    return this.withServices(barbershopId, rows);
  }

  async findById(
    barbershopId: string,
    appointmentId: string,
  ): Promise<ScheduleEntry | null> {
    const rows = await this.dataSource.query<AppointmentRow[]>(
      `${SELECT_APPOINTMENTS}
       WHERE a.barbershop_id = $1 AND a.id = $2`,
      [barbershopId, appointmentId],
    );
    const [entry] = await this.withServices(barbershopId, rows);
    return entry ?? null;
  }

  async listForClient(
    barbershopId: string,
    clientId: string,
    barberId: string | null,
  ): Promise<ScheduleEntry[]> {
    const rows = await this.dataSource.query<AppointmentRow[]>(
      `${SELECT_APPOINTMENTS}
       WHERE a.barbershop_id = $1
         AND a.client_id = $2
         AND ($3::uuid IS NULL OR a.barber_id = $3::uuid)
       ORDER BY a.starts_at, a.id`,
      [barbershopId, clientId, barberId],
    );
    return this.withServices(barbershopId, rows);
  }

  private async withServices(
    barbershopId: string,
    rows: AppointmentRow[],
  ): Promise<ScheduleEntry[]> {
    if (rows.length === 0) return [];
    const services = await this.dataSource.query<ServiceRow[]>(
      `SELECT s.appointment_id, sv.id, sv.name
       FROM appointment_services s
       JOIN services sv ON sv.id = s.service_id AND sv.barbershop_id = s.barbershop_id
       WHERE s.barbershop_id = $1 AND s.appointment_id = ANY($2::uuid[])
       ORDER BY s.appointment_id, s.position`,
      [barbershopId, rows.map((row) => row.id)],
    );
    return rows.map((row) => ({
      id: row.id,
      barber: { id: row.barber_id, name: row.barber_name },
      client: row.client,
      services: services
        .filter((service) => service.appointment_id === row.id)
        .map((service) => ({ id: service.id, name: service.name })),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      origin: row.origin,
    }));
  }
}

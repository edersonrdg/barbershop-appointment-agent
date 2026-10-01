import { DataSource, In, LessThan, MoreThan, QueryFailedError } from 'typeorm';
import {
  Appointment,
  AppointmentStatus,
} from '../../../domain/entities/appointment';
import { UtcPeriod } from '../../../domain/entities/barbershop';
import { Client } from '../../../domain/entities/client';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { ClientPhoneTakenError } from '../../../domain/errors/client-phone-taken.error';
import { ReminderKind } from '../../../domain/value-objects/appointment-reminder';
import {
  AppointmentRepository,
  BusyPeriod,
} from '../../../usecases/ports/appointment.repository.port';
import { AppointmentServiceEntity } from '../entities/appointment-service.entity';
import { AppointmentEntity } from '../entities/appointment.entity';
import { ClientEntity } from '../entities/client.entity';

const EXCLUSION_VIOLATION = '23P01';
const APPOINTMENTS_NO_OVERLAP = 'appointments_no_overlap';
const UNIQUE_VIOLATION = '23505';
const CLIENTS_BARBERSHOP_PHONE_UNIQUE = 'clients_barbershop_phone_unique';
// RN-03: attended and no-show appointments keep holding the slot (ATD-04).
const SLOT_HOLDING_STATUSES: AppointmentStatus[] = [
  'confirmed',
  'attended',
  'no_show',
];

const REMINDER_COLUMNS: Record<ReminderKind, string> = {
  '24h': 'reminder_24h_sent_at',
  '1h': 'reminder_1h_sent_at',
};

export class TypeOrmAppointmentRepository implements AppointmentRepository {
  constructor(private readonly dataSource: DataSource) {}

  async listBusyPeriods(
    barbershopId: string,
    barberIds: readonly string[],
    range: UtcPeriod,
  ): Promise<BusyPeriod[]> {
    if (barberIds.length === 0) return [];
    const rows = await this.dataSource.getRepository(AppointmentEntity).find({
      where: {
        barbershopId,
        barberId: In([...barberIds]),
        status: In(SLOT_HOLDING_STATUSES),
        startsAt: LessThan(range.end),
        endsAt: MoreThan(range.start),
      },
      order: { startsAt: 'ASC' },
    });
    return rows.map((row) => ({
      barberId: row.barberId,
      start: row.startsAt,
      end: row.endsAt,
    }));
  }

  async findById(
    barbershopId: string,
    appointmentId: string,
  ): Promise<Appointment | null> {
    const row = await this.dataSource
      .getRepository(AppointmentEntity)
      .findOneBy({ id: appointmentId, barbershopId });
    if (!row) return null;
    const services = await this.dataSource
      .getRepository(AppointmentServiceEntity)
      .find({
        where: { appointmentId, barbershopId },
        order: { position: 'ASC' },
      });
    return Appointment.restore({
      id: row.id,
      barbershopId: row.barbershopId,
      barberId: row.barberId,
      clientId: row.clientId,
      serviceIds: services.map((service) => service.serviceId),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      origin: row.origin,
      createdAt: row.createdAt,
    });
  }

  async saveStatus(appointment: Appointment): Promise<void> {
    await this.dataSource
      .getRepository(AppointmentEntity)
      .update(
        { id: appointment.id, barbershopId: appointment.barbershopId },
        { status: appointment.status },
      );
  }

  // A conditional UPDATE, so of two concurrent runs only one records the
  // reminder, and a cancellation in between leaves it unrecorded (door 1).
  async claimReminder(
    barbershopId: string,
    appointmentId: string,
    kind: ReminderKind,
    now: Date,
  ): Promise<boolean> {
    const column = REMINDER_COLUMNS[kind];
    const [, affected] = await this.dataSource.query<[unknown, number]>(
      `UPDATE appointments SET ${column} = $3
       WHERE barbershop_id = $1 AND id = $2
         AND ${column} IS NULL AND status = 'confirmed'`,
      [barbershopId, appointmentId, now],
    );
    return affected === 1;
  }

  async confirmByClient(
    barbershopId: string,
    appointmentId: string,
    now: Date,
  ): Promise<boolean> {
    const [, affected] = await this.dataSource.query<[unknown, number]>(
      `UPDATE appointments SET client_confirmed_at = $3
       WHERE barbershop_id = $1 AND id = $2
         AND client_confirmed_at IS NULL AND status = 'confirmed'
         AND reminder_24h_sent_at IS NOT NULL`,
      [barbershopId, appointmentId, now],
    );
    return affected === 1;
  }

  async create(
    appointment: Appointment,
    newClient: Client | null = null,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        if (newClient) {
          await manager.insert(ClientEntity, {
            id: newClient.id,
            barbershopId: newClient.barbershopId,
            name: newClient.name,
            phone: newClient.phone,
            createdAt: newClient.createdAt,
            returnReminderEnabled: newClient.returnReminderEnabled,
          });
        }
        await manager.insert(AppointmentEntity, {
          id: appointment.id,
          barbershopId: appointment.barbershopId,
          barberId: appointment.barberId,
          clientId: appointment.clientId,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          status: appointment.status,
          origin: appointment.origin,
          createdAt: appointment.createdAt,
        });
        await manager.insert(
          AppointmentServiceEntity,
          appointment.serviceIds.map((serviceId, position) => ({
            appointmentId: appointment.id,
            position,
            serviceId,
            barbershopId: appointment.barbershopId,
          })),
        );
      });
    } catch (error) {
      // RN-07: another booking won the race between the availability check
      // and this INSERT.
      if (isViolationOf(error, EXCLUSION_VIOLATION, APPOINTMENTS_NO_OVERLAP)) {
        throw new AppointmentConflictError('RN-07');
      }
      // RN-08: another request stored the same phone after the lookup.
      if (
        isViolationOf(error, UNIQUE_VIOLATION, CLIENTS_BARBERSHOP_PHONE_UNIQUE)
      ) {
        throw new ClientPhoneTakenError();
      }
      throw error;
    }
  }
}

function isViolationOf(
  error: unknown,
  code: string,
  constraint: string,
): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError: unknown = error.driverError;
  if (typeof driverError !== 'object' || driverError === null) return false;
  return (
    'code' in driverError &&
    driverError.code === code &&
    'constraint' in driverError &&
    driverError.constraint === constraint
  );
}

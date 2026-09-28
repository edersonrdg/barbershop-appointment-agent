import { DataSource, In, LessThan, MoreThan, QueryFailedError } from 'typeorm';
import { Appointment } from '../../../domain/entities/appointment';
import { UtcPeriod } from '../../../domain/entities/barbershop';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import {
  AppointmentRepository,
  BusyPeriod,
} from '../../../usecases/ports/appointment.repository.port';
import { AppointmentServiceEntity } from '../entities/appointment-service.entity';
import { AppointmentEntity } from '../entities/appointment.entity';

const EXCLUSION_VIOLATION = '23P01';
const APPOINTMENTS_NO_OVERLAP = 'appointments_no_overlap';

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
        status: 'confirmed',
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

  async create(appointment: Appointment): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.insert(AppointmentEntity, {
          id: appointment.id,
          barbershopId: appointment.barbershopId,
          barberId: appointment.barberId,
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
      if (isOverlapViolation(error)) {
        throw new AppointmentConflictError('RN-07');
      }
      throw error;
    }
  }
}

function isOverlapViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError: unknown = error.driverError;
  if (typeof driverError !== 'object' || driverError === null) return false;
  return (
    'code' in driverError &&
    driverError.code === EXCLUSION_VIOLATION &&
    'constraint' in driverError &&
    driverError.constraint === APPOINTMENTS_NO_OVERLAP
  );
}

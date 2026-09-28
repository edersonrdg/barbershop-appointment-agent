import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { Barber } from '../../../domain/entities/barber';
import { BarberNameAlreadyExistsError } from '../../../domain/errors/barber-name-already-exists.error';
import { BarberNotFoundError } from '../../../domain/errors/barber-not-found.error';
import { BarberUserAlreadyLinkedError } from '../../../domain/errors/barber-user-already-linked.error';
import { DayWorkingHours } from '../../../domain/value-objects/day-working-hours';
import { TimeOfDay } from '../../../domain/value-objects/time-of-day';
import {
  WEEKDAYS,
  isoWeekdayNumber,
  weekdayFromIsoNumber,
} from '../../../domain/value-objects/weekday';
import {
  WeeklyWorkingHours,
  WeeklyWorkingHoursDays,
} from '../../../domain/value-objects/weekly-working-hours';
import { BarberRepository } from '../../../usecases/ports/barber.repository.port';
import { BarberServiceEntity } from '../entities/barber-service.entity';
import { BarberWorkingHoursEntity } from '../entities/barber-working-hours.entity';
import { BarberEntity } from '../entities/barber.entity';

const UNIQUE_VIOLATION = '23505';
const BARBERS_NAME_UNIQUE = 'barbers_name_unique';
const BARBERS_USER_ID_UNIQUE = 'barbers_user_id_unique';

export class TypeOrmBarberRepository implements BarberRepository {
  constructor(private readonly dataSource: DataSource) {}

  listByBarbershop(barbershopId: string): Promise<Barber[]> {
    return this.list(barbershopId, false);
  }

  listActiveByBarbershop(barbershopId: string): Promise<Barber[]> {
    return this.list(barbershopId, true);
  }

  async findById(
    barbershopId: string,
    barberId: string,
  ): Promise<Barber | null> {
    const row = await this.dataSource
      .getRepository(BarberEntity)
      .findOneBy({ barbershopId, id: barberId });
    if (!row) return null;
    const [barber] = await this.toDomain([row]);
    return barber;
  }

  async findByUserId(
    barbershopId: string,
    userId: string,
  ): Promise<Barber | null> {
    const row = await this.dataSource
      .getRepository(BarberEntity)
      .findOneBy({ barbershopId, userId });
    if (!row) return null;
    const [barber] = await this.toDomain([row]);
    return barber;
  }

  async create(barber: Barber): Promise<void> {
    await this.writeWithUniqueGuard(async (manager) => {
      await manager.insert(BarberEntity, {
        id: barber.id,
        barbershopId: barber.barbershopId,
        name: barber.name,
        userId: barber.userId,
        active: barber.active,
        createdAt: barber.createdAt,
      });
      await insertChildren(manager, barber);
    });
  }

  async save(barber: Barber): Promise<void> {
    await this.writeWithUniqueGuard(async (manager) => {
      const { affected } = await manager.update(
        BarberEntity,
        { id: barber.id, barbershopId: barber.barbershopId },
        { name: barber.name, userId: barber.userId, active: barber.active },
      );
      // RN-26: the working hours are keyed only by barber_id, so the children
      // are replaced only after the barber row of this tenant was matched.
      if (affected !== 1) {
        throw new BarberNotFoundError();
      }
      await manager.delete(BarberServiceEntity, { barberId: barber.id });
      await manager.delete(BarberWorkingHoursEntity, { barberId: barber.id });
      await insertChildren(manager, barber);
    });
  }

  private async list(
    barbershopId: string,
    onlyActive: boolean,
  ): Promise<Barber[]> {
    const query = this.dataSource
      .getRepository(BarberEntity)
      .createQueryBuilder('barber')
      .where('barber.barbershop_id = :barbershopId', { barbershopId });
    if (onlyActive) {
      query.andWhere('barber.active = true');
    }
    const rows = await query.orderBy('LOWER(barber.name)', 'ASC').getMany();
    return this.toDomain(rows);
  }

  private async toDomain(rows: BarberEntity[]): Promise<Barber[]> {
    if (rows.length === 0) return [];
    const barberIds = rows.map((row) => row.id);
    const serviceRows = await this.dataSource
      .getRepository(BarberServiceEntity)
      .find({
        where: { barberId: In(barberIds) },
        order: { position: 'ASC' },
      });
    const dayRows = await this.dataSource
      .getRepository(BarberWorkingHoursEntity)
      .findBy({ barberId: In(barberIds) });
    return rows.map((row) =>
      Barber.restore({
        id: row.id,
        barbershopId: row.barbershopId,
        name: row.name,
        active: row.active,
        userId: row.userId,
        serviceIds: serviceRows
          .filter((service) => service.barberId === row.id)
          .map((service) => service.serviceId),
        workingHours: toWeeklyWorkingHours(
          dayRows.filter((day) => day.barberId === row.id),
        ),
        createdAt: row.createdAt,
      }),
    );
  }

  private async writeWithUniqueGuard(
    write: (manager: EntityManager) => Promise<void>,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(write);
    } catch (error) {
      const constraint = uniqueViolationConstraint(error);
      if (constraint === BARBERS_NAME_UNIQUE) {
        throw new BarberNameAlreadyExistsError();
      }
      if (constraint === BARBERS_USER_ID_UNIQUE) {
        throw new BarberUserAlreadyLinkedError();
      }
      throw error;
    }
  }
}

async function insertChildren(
  manager: EntityManager,
  barber: Barber,
): Promise<void> {
  if (barber.serviceIds.length > 0) {
    await manager.insert(
      BarberServiceEntity,
      barber.serviceIds.map((serviceId, position) => ({
        barberId: barber.id,
        serviceId,
        barbershopId: barber.barbershopId,
        position,
      })),
    );
  }
  const dayRows = toWorkingHoursRows(barber);
  if (dayRows.length > 0) {
    await manager.insert(BarberWorkingHoursEntity, dayRows);
  }
}

function toWorkingHoursRows(barber: Barber): BarberWorkingHoursEntity[] {
  return WEEKDAYS.flatMap((weekday) => {
    const day = barber.workingHours.forDay(weekday);
    if (!day) return [];
    return [
      {
        barberId: barber.id,
        weekday: isoWeekdayNumber(weekday),
        startsAt: day.startsAt.toString(),
        endsAt: day.endsAt.toString(),
        breakStartsAt: day.break?.startsAt.toString() ?? null,
        breakEndsAt: day.break?.endsAt.toString() ?? null,
      },
    ];
  });
}

function toWeeklyWorkingHours(
  rows: BarberWorkingHoursEntity[],
): WeeklyWorkingHours {
  const days = Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, null]),
  ) as WeeklyWorkingHoursDays;
  for (const row of rows) {
    const weekday = weekdayFromIsoNumber(row.weekday);
    days[weekday] = DayWorkingHours.create({
      weekday,
      startsAt: toTimeOfDay(row.startsAt),
      endsAt: toTimeOfDay(row.endsAt),
      break:
        row.breakStartsAt && row.breakEndsAt
          ? {
              startsAt: toTimeOfDay(row.breakStartsAt),
              endsAt: toTimeOfDay(row.breakEndsAt),
            }
          : null,
    });
  }
  return WeeklyWorkingHours.create(days);
}

// O Postgres devolve `time` como HH:mm:ss; o domínio trabalha em HH:mm.
function toTimeOfDay(value: string): TimeOfDay {
  return TimeOfDay.create(value.slice(0, 5));
}

function uniqueViolationConstraint(error: unknown): string | null {
  if (!(error instanceof QueryFailedError)) return null;
  const driverError: unknown = error.driverError;
  if (typeof driverError !== 'object' || driverError === null) return null;
  if (!('code' in driverError) || driverError.code !== UNIQUE_VIOLATION) {
    return null;
  }
  return 'constraint' in driverError &&
    typeof driverError.constraint === 'string'
    ? driverError.constraint
    : null;
}

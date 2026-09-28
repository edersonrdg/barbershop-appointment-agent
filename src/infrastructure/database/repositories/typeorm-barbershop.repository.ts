import { DataSource } from 'typeorm';
import {
  Barbershop,
  SubscriptionStatus,
} from '../../../domain/entities/barbershop';
import { User } from '../../../domain/entities/user';
import { EmailAlreadyRegisteredError } from '../../../domain/errors/email-already-registered.error';
import { BarbershopTimezone } from '../../../domain/value-objects/barbershop-timezone';
import { BookingRules } from '../../../domain/value-objects/booking-rules';
import { DayOpeningHours } from '../../../domain/value-objects/day-opening-hours';
import { TimeOfDay } from '../../../domain/value-objects/time-of-day';
import {
  WEEKDAYS,
  isoWeekdayNumber,
  weekdayFromIsoNumber,
} from '../../../domain/value-objects/weekday';
import {
  WeeklyOpeningHours,
  WeeklyOpeningHoursDays,
} from '../../../domain/value-objects/weekly-opening-hours';
import { BarbershopRepository } from '../../../usecases/ports/barbershop.repository.port';
import { BarbershopBookingRulesEntity } from '../entities/barbershop-booking-rules.entity';
import { BarbershopOpeningHoursEntity } from '../entities/barbershop-opening-hours.entity';
import { BarbershopEntity } from '../entities/barbershop.entity';
import { UserEntity } from '../entities/user.entity';
import { isEmailUniqueViolation } from './email-unique-violation';
import { toColumns } from './typeorm-booking-rules.repository';

export class TypeOrmBarbershopRepository implements BarbershopRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createWithOwner(
    barbershop: Barbershop,
    owner: User,
    bookingRules: BookingRules,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.insert(BarbershopEntity, {
          id: barbershop.id,
          name: barbershop.name,
          timezone: barbershop.timezone,
          subscriptionStatus: barbershop.subscriptionStatus,
          trialEndsAt: barbershop.trialEndsAt,
          createdAt: barbershop.createdAt,
        });
        await manager.insert(UserEntity, {
          id: owner.id,
          barbershopId: owner.barbershopId,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
          passwordHash: owner.passwordHash,
          role: owner.role,
          createdAt: owner.createdAt,
        });
        await manager.insert(BarbershopBookingRulesEntity, {
          barbershopId: barbershop.id,
          ...toColumns(bookingRules),
        });
      });
    } catch (error) {
      if (isEmailUniqueViolation(error)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }

  async findById(barbershopId: string): Promise<Barbershop | null> {
    const row = await this.dataSource
      .getRepository(BarbershopEntity)
      .findOneBy({ id: barbershopId });
    if (!row) return null;
    const dayRows = await this.dataSource
      .getRepository(BarbershopOpeningHoursEntity)
      .findBy({ barbershopId });
    return Barbershop.restore({
      id: row.id,
      name: row.name,
      address: row.address,
      timezone: BarbershopTimezone.create(row.timezone),
      openingHours: toWeeklyOpeningHours(dayRows),
      subscriptionStatus: row.subscriptionStatus as SubscriptionStatus,
      trialEndsAt: row.trialEndsAt,
      createdAt: row.createdAt,
    });
  }

  async saveSettings(barbershop: Barbershop): Promise<void> {
    const dayRows = toOpeningHoursRows(barbershop);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        BarbershopEntity,
        { id: barbershop.id },
        {
          name: barbershop.name,
          address: barbershop.address,
          timezone: barbershop.timezone,
        },
      );
      await manager.delete(BarbershopOpeningHoursEntity, {
        barbershopId: barbershop.id,
      });
      if (dayRows.length > 0) {
        await manager.insert(BarbershopOpeningHoursEntity, dayRows);
      }
    });
  }
}

function toOpeningHoursRows(
  barbershop: Barbershop,
): BarbershopOpeningHoursEntity[] {
  return WEEKDAYS.flatMap((weekday) => {
    const day = barbershop.openingHours.forDay(weekday);
    if (!day) return [];
    return [
      {
        barbershopId: barbershop.id,
        weekday: isoWeekdayNumber(weekday),
        opensAt: day.opensAt.toString(),
        closesAt: day.closesAt.toString(),
        breakStartsAt: day.break?.startsAt.toString() ?? null,
        breakEndsAt: day.break?.endsAt.toString() ?? null,
      },
    ];
  });
}

function toWeeklyOpeningHours(
  rows: BarbershopOpeningHoursEntity[],
): WeeklyOpeningHours {
  const days = Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, null]),
  ) as WeeklyOpeningHoursDays;
  for (const row of rows) {
    const weekday = weekdayFromIsoNumber(row.weekday);
    days[weekday] = DayOpeningHours.create({
      weekday,
      opensAt: toTimeOfDay(row.opensAt),
      closesAt: toTimeOfDay(row.closesAt),
      break:
        row.breakStartsAt && row.breakEndsAt
          ? {
              startsAt: toTimeOfDay(row.breakStartsAt),
              endsAt: toTimeOfDay(row.breakEndsAt),
            }
          : null,
    });
  }
  return WeeklyOpeningHours.create(days);
}

// O Postgres devolve `time` como HH:mm:ss; o domínio trabalha em HH:mm.
function toTimeOfDay(value: string): TimeOfDay {
  return TimeOfDay.create(value.slice(0, 5));
}

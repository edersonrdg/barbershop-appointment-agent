import { UserRole } from '../../domain/entities/user';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { isUnconfirmed } from '../../domain/value-objects/appointment-reminder';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import {
  SchedulePeriod,
  ScheduleView,
} from '../../domain/value-objects/schedule-period';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { Clock } from '../ports/clock.port';
import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';
import { BarberAccessPolicy } from '../shared/barber-access-policy';

export interface ListScheduleInput {
  barbershopId: string;
  userId: string;
  role: UserRole;
  view: ScheduleView;
  date: string;
  barberId?: string;
}

/** US-19 (CA-19.5): `unconfirmed` is the alert the panel shows. */
export interface ScheduleItem extends ScheduleEntry {
  unconfirmed: boolean;
}

export interface Schedule {
  period: SchedulePeriod;
  timezone: string;
  entries: ScheduleItem[];
}

export class ListScheduleUseCase {
  private readonly access: BarberAccessPolicy;

  constructor(
    private readonly barbershops: BarbershopRepository,
    barbers: BarberRepository,
    private readonly schedule: ScheduleQuery,
    private readonly bookingRules: BookingRulesRepository,
    private readonly clock: Clock,
  ) {
    this.access = new BarberAccessPolicy(barbers);
  }

  async execute(input: ListScheduleInput): Promise<Schedule> {
    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new InvalidCredentialsError();
    }
    const timezone = BarbershopTimezone.create(barbershop.timezone);
    const period = SchedulePeriod.create({
      view: input.view,
      localDate: input.date,
      timezone,
    });
    const barberId = await this.access.readScope(input);
    const entries =
      barberId === undefined
        ? []
        : await this.schedule.listStartingIn(
            input.barbershopId,
            period.utc,
            barberId,
          );
    const rules =
      (await this.bookingRules.findByBarbershopId(input.barbershopId)) ??
      BookingRules.defaults();
    const now = this.clock.now();
    return {
      period,
      timezone: timezone.value,
      entries: entries.map((entry) => ({
        ...entry,
        unconfirmed: isUnconfirmed(
          entry,
          rules.cancellationDeadlineMinutes,
          now,
        ),
      })),
    };
  }
}

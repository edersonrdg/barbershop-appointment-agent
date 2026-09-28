import { UserRole } from '../../domain/entities/user';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import {
  SchedulePeriod,
  ScheduleView,
} from '../../domain/value-objects/schedule-period';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
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

export interface Schedule {
  period: SchedulePeriod;
  timezone: string;
  entries: ScheduleEntry[];
}

export class ListScheduleUseCase {
  private readonly access: BarberAccessPolicy;

  constructor(
    private readonly barbershops: BarbershopRepository,
    barbers: BarberRepository,
    private readonly schedule: ScheduleQuery,
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
    return { period, timezone: timezone.value, entries };
  }
}

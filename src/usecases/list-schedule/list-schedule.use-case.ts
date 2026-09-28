import { UserRole } from '../../domain/entities/user';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import {
  SchedulePeriod,
  ScheduleView,
} from '../../domain/value-objects/schedule-period';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';

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
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly barbers: BarberRepository,
    private readonly schedule: ScheduleQuery,
  ) {}

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
    const barberId =
      input.role === 'barber'
        ? await this.ownBarberId(input)
        : await this.filteredBarberId(input);
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

  // CA-08.2: a barber sees only the barber linked to their user; without one
  // there is no schedule of their own (CA-05.2).
  private async ownBarberId(
    input: ListScheduleInput,
  ): Promise<string | undefined> {
    const own = await this.barbers.findByUserId(
      input.barbershopId,
      input.userId,
    );
    if (input.barberId !== undefined && input.barberId !== own?.id) {
      throw new ScheduleAccessDeniedError();
    }
    return own?.id;
  }

  private async filteredBarberId(
    input: ListScheduleInput,
  ): Promise<string | null> {
    if (input.barberId === undefined) return null;
    const barber = await this.barbers.findById(
      input.barbershopId,
      input.barberId,
    );
    if (!barber) {
      throw new BarberNotFoundError();
    }
    return barber.id;
  }
}

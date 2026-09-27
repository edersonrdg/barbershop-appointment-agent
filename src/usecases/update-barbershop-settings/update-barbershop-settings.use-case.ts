import { Barbershop } from '../../domain/entities/barbershop';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { DayOpeningHours } from '../../domain/value-objects/day-opening-hours';
import { TimeOfDay } from '../../domain/value-objects/time-of-day';
import { Weekday, WEEKDAYS } from '../../domain/value-objects/weekday';
import {
  WeeklyOpeningHours,
  WeeklyOpeningHoursDays,
} from '../../domain/value-objects/weekly-opening-hours';
import { BarbershopRepository } from '../ports/barbershop.repository.port';

export interface DayOpeningHoursInput {
  opensAt: string;
  closesAt: string;
  break: { startsAt: string; endsAt: string } | null;
}

export interface UpdateBarbershopSettingsInput {
  barbershopId: string;
  name: string;
  address: string;
  timezone: string;
  openingHours: Record<Weekday, DayOpeningHoursInput | null>;
}

export class UpdateBarbershopSettingsUseCase {
  constructor(private readonly barbershops: BarbershopRepository) {}

  async execute(input: UpdateBarbershopSettingsInput): Promise<Barbershop> {
    const timezone = BarbershopTimezone.create(input.timezone);
    const openingHours = toWeeklyOpeningHours(input.openingHours);

    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new InvalidCredentialsError();
    }

    barbershop.updateSettings({
      name: input.name,
      address: input.address,
      timezone,
      openingHours,
    });
    await this.barbershops.saveSettings(barbershop);
    return barbershop;
  }
}

function toWeeklyOpeningHours(
  input: Record<Weekday, DayOpeningHoursInput | null>,
): WeeklyOpeningHours {
  const days = Object.fromEntries(
    WEEKDAYS.map((weekday) => {
      const day = input[weekday];
      if (!day) return [weekday, null];
      return [
        weekday,
        DayOpeningHours.create({
          weekday,
          opensAt: TimeOfDay.create(day.opensAt),
          closesAt: TimeOfDay.create(day.closesAt),
          break: day.break
            ? {
                startsAt: TimeOfDay.create(day.break.startsAt),
                endsAt: TimeOfDay.create(day.break.endsAt),
              }
            : null,
        }),
      ];
    }),
  ) as WeeklyOpeningHoursDays;
  return WeeklyOpeningHours.create(days);
}

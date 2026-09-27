import { Barbershop } from '../../domain/entities/barbershop';
import { Weekday, WEEKDAYS } from '../../domain/value-objects/weekday';

export interface DayOpeningHoursResponse {
  opensAt: string;
  closesAt: string;
  break: { startsAt: string; endsAt: string } | null;
}

export interface BarbershopSettingsResponse {
  name: string;
  address: string | null;
  timezone: string;
  openingHours: Record<Weekday, DayOpeningHoursResponse | null>;
}

export class BarbershopSettingsPresenter {
  static toResponse(barbershop: Barbershop): BarbershopSettingsResponse {
    const openingHours = Object.fromEntries(
      WEEKDAYS.map((weekday) => {
        const day = barbershop.openingHours.forDay(weekday);
        if (!day) return [weekday, null];
        return [
          weekday,
          {
            opensAt: day.opensAt.toString(),
            closesAt: day.closesAt.toString(),
            break: day.break
              ? {
                  startsAt: day.break.startsAt.toString(),
                  endsAt: day.break.endsAt.toString(),
                }
              : null,
          },
        ];
      }),
    ) as Record<Weekday, DayOpeningHoursResponse | null>;

    return {
      name: barbershop.name,
      address: barbershop.address,
      timezone: barbershop.timezone,
      openingHours,
    };
  }
}

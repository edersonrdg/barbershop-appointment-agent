import { DayOpeningHours } from './day-opening-hours';
import { Weekday, WEEKDAYS } from './weekday';

export type WeeklyOpeningHoursDays = Record<Weekday, DayOpeningHours | null>;

export class WeeklyOpeningHours {
  private constructor(private readonly days: WeeklyOpeningHoursDays) {}

  static create(days: WeeklyOpeningHoursDays): WeeklyOpeningHours {
    return new WeeklyOpeningHours({ ...days });
  }

  static allClosed(): WeeklyOpeningHours {
    const days = Object.fromEntries(
      WEEKDAYS.map((weekday) => [weekday, null]),
    ) as WeeklyOpeningHoursDays;
    return new WeeklyOpeningHours(days);
  }

  forDay(weekday: Weekday): DayOpeningHours | null {
    return this.days[weekday];
  }
}

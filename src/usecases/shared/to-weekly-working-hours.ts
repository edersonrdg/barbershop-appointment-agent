import { DayWorkingHours } from '../../domain/value-objects/day-working-hours';
import { TimeOfDay } from '../../domain/value-objects/time-of-day';
import { Weekday, WEEKDAYS } from '../../domain/value-objects/weekday';
import {
  WeeklyWorkingHours,
  WeeklyWorkingHoursDays,
} from '../../domain/value-objects/weekly-working-hours';

export interface WorkingDayInput {
  startsAt: string;
  endsAt: string;
  break: { startsAt: string; endsAt: string } | null;
}

export type WorkingHoursInput = Record<Weekday, WorkingDayInput | null>;

export function toWeeklyWorkingHours(
  input: WorkingHoursInput,
): WeeklyWorkingHours {
  const days = Object.fromEntries(
    WEEKDAYS.map((weekday) => {
      const day = input[weekday];
      if (!day) return [weekday, null];
      return [
        weekday,
        DayWorkingHours.create({
          weekday,
          startsAt: TimeOfDay.create(day.startsAt),
          endsAt: TimeOfDay.create(day.endsAt),
          break: day.break
            ? {
                startsAt: TimeOfDay.create(day.break.startsAt),
                endsAt: TimeOfDay.create(day.break.endsAt),
              }
            : null,
        }),
      ];
    }),
  ) as WeeklyWorkingHoursDays;
  return WeeklyWorkingHours.create(days);
}

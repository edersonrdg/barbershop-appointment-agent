import { LocalPeriod } from './day-opening-hours';
import { DayWorkingHours } from './day-working-hours';
import { Weekday, WEEKDAY_LABELS, WEEKDAYS } from './weekday';
import { WeeklyOpeningHours } from './weekly-opening-hours';

export type WeeklyWorkingHoursDays = Record<Weekday, DayWorkingHours | null>;

export interface WorkingHoursWarning {
  weekday: Weekday;
  message: string;
}

export class WeeklyWorkingHours {
  private constructor(private readonly days: WeeklyWorkingHoursDays) {}

  static create(days: WeeklyWorkingHoursDays): WeeklyWorkingHours {
    return new WeeklyWorkingHours({ ...days });
  }

  forDay(weekday: Weekday): DayWorkingHours | null {
    return this.days[weekday];
  }

  // CA-05.3: the working day is saved anyway; only the part inside the opening
  // hours will be offered (RN-05), so the owner is warned about the rest.
  warningsAgainst(openingHours: WeeklyOpeningHours): WorkingHoursWarning[] {
    return WEEKDAYS.flatMap((weekday) => {
      const workDay = this.days[weekday];
      if (!workDay) return [];
      const label = WEEKDAY_LABELS[weekday];
      const openDay = openingHours.forDay(weekday);
      if (!openDay) {
        return [
          {
            weekday,
            message: `${label}: a barbearia não abre neste dia, então a jornada não estará disponível.`,
          },
        ];
      }
      const openPeriods = openDay.openPeriods();
      const allInside = workDay
        .workPeriods()
        .every((work) => openPeriods.some((open) => contains(open, work)));
      if (allInside) return [];
      return [
        {
          weekday,
          message: `${label}: só o trecho da jornada dentro do horário de funcionamento estará disponível.`,
        },
      ];
    });
  }
}

// Open periods of a day never touch (the break has a positive length), so a
// work period inside their union is always inside a single one of them.
function contains(outer: LocalPeriod, inner: LocalPeriod): boolean {
  return (
    outer.start.minutes <= inner.start.minutes &&
    inner.end.minutes <= outer.end.minutes
  );
}

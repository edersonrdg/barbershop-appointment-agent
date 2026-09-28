import { UtcPeriod } from '../entities/barbershop';
import { BarbershopTimezone } from './barbershop-timezone';
import { TimeOfDay } from './time-of-day';
import { isoWeekdayNumber } from './weekday';

export type ScheduleView = 'day' | 'week';

const MIDNIGHT = TimeOfDay.create('00:00');
const DAYS_IN_WEEK = 7;

export class SchedulePeriod {
  private constructor(
    readonly view: ScheduleView,
    readonly startDate: string,
    readonly endDate: string,
    readonly utc: UtcPeriod,
  ) {}

  // CA-08.1: the week runs from Monday to Sunday in the barbershop timezone.
  static create({
    view,
    localDate,
    timezone,
  }: {
    view: ScheduleView;
    localDate: string;
    timezone: BarbershopTimezone;
  }): SchedulePeriod {
    const startDate =
      view === 'day'
        ? localDate
        : addDays(
            localDate,
            1 - isoWeekdayNumber(timezone.weekdayOf(localDate)),
          );
    const start = timezone.toUtc(startDate, MIDNIGHT);
    const days = view === 'day' ? 1 : DAYS_IN_WEEK;
    return new SchedulePeriod(view, startDate, addDays(startDate, days - 1), {
      start,
      end: timezone.toUtc(addDays(startDate, days), MIDNIGHT),
    });
  }
}

function addDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

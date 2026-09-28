import { InvalidWorkingHoursError } from '../errors/invalid-working-hours.error';
import { LocalPeriod } from './day-opening-hours';
import { TimeOfDay } from './time-of-day';
import { Weekday, WEEKDAY_LABELS } from './weekday';

export interface WorkingBreak {
  startsAt: TimeOfDay;
  endsAt: TimeOfDay;
}

export class DayWorkingHours {
  private constructor(
    readonly weekday: Weekday,
    readonly startsAt: TimeOfDay,
    readonly endsAt: TimeOfDay,
    private readonly workingBreak: WorkingBreak | null,
  ) {}

  get break(): WorkingBreak | null {
    return this.workingBreak;
  }

  static create({
    weekday,
    startsAt,
    endsAt,
    break: workingBreak = null,
  }: {
    weekday: Weekday;
    startsAt: TimeOfDay;
    endsAt: TimeOfDay;
    break?: WorkingBreak | null;
  }): DayWorkingHours {
    const label = WEEKDAY_LABELS[weekday];
    if (endsAt.minutes <= startsAt.minutes) {
      throw new InvalidWorkingHoursError(
        `${label}: o fim da jornada deve ser depois do início.`,
      );
    }
    if (workingBreak && !isWithin(workingBreak, startsAt, endsAt)) {
      throw new InvalidWorkingHoursError(
        `${label}: o intervalo deve começar e terminar dentro da jornada, com o fim depois do início.`,
      );
    }
    return new DayWorkingHours(weekday, startsAt, endsAt, workingBreak);
  }

  workPeriods(): LocalPeriod[] {
    if (!this.workingBreak) {
      return [{ start: this.startsAt, end: this.endsAt }];
    }
    return [
      { start: this.startsAt, end: this.workingBreak.startsAt },
      { start: this.workingBreak.endsAt, end: this.endsAt },
    ];
  }
}

function isWithin(
  workingBreak: WorkingBreak,
  startsAt: TimeOfDay,
  endsAt: TimeOfDay,
): boolean {
  return (
    startsAt.minutes < workingBreak.startsAt.minutes &&
    workingBreak.startsAt.minutes < workingBreak.endsAt.minutes &&
    workingBreak.endsAt.minutes < endsAt.minutes
  );
}

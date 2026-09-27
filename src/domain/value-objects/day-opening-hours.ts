import { InvalidOpeningHoursError } from '../errors/invalid-opening-hours.error';
import { TimeOfDay } from './time-of-day';
import { Weekday, WEEKDAY_LABELS } from './weekday';

export interface OpeningBreak {
  startsAt: TimeOfDay;
  endsAt: TimeOfDay;
}

export interface LocalPeriod {
  start: TimeOfDay;
  end: TimeOfDay;
}

export class DayOpeningHours {
  private constructor(
    readonly weekday: Weekday,
    readonly opensAt: TimeOfDay,
    readonly closesAt: TimeOfDay,
    private readonly openingBreak: OpeningBreak | null,
  ) {}

  get break(): OpeningBreak | null {
    return this.openingBreak;
  }

  static create({
    weekday,
    opensAt,
    closesAt,
    break: openingBreak = null,
  }: {
    weekday: Weekday;
    opensAt: TimeOfDay;
    closesAt: TimeOfDay;
    break?: OpeningBreak | null;
  }): DayOpeningHours {
    const label = WEEKDAY_LABELS[weekday];
    if (closesAt.minutes <= opensAt.minutes) {
      throw new InvalidOpeningHoursError(
        `${label}: o horário de fechamento deve ser depois do de abertura.`,
      );
    }
    if (openingBreak && !isWithin(openingBreak, opensAt, closesAt)) {
      throw new InvalidOpeningHoursError(
        `${label}: o intervalo deve começar e terminar dentro do horário de funcionamento, com o fim depois do início.`,
      );
    }
    return new DayOpeningHours(weekday, opensAt, closesAt, openingBreak);
  }

  openPeriods(): LocalPeriod[] {
    if (!this.openingBreak) {
      return [{ start: this.opensAt, end: this.closesAt }];
    }
    return [
      { start: this.opensAt, end: this.openingBreak.startsAt },
      { start: this.openingBreak.endsAt, end: this.closesAt },
    ];
  }
}

function isWithin(
  openingBreak: OpeningBreak,
  opensAt: TimeOfDay,
  closesAt: TimeOfDay,
): boolean {
  return (
    opensAt.minutes < openingBreak.startsAt.minutes &&
    openingBreak.startsAt.minutes < openingBreak.endsAt.minutes &&
    openingBreak.endsAt.minutes < closesAt.minutes
  );
}

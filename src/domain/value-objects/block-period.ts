import { UtcPeriod } from '../entities/barbershop';
import { InvalidValueError } from '../errors/invalid-value.error';
import { BarbershopTimezone } from './barbershop-timezone';
import { SchedulePeriod } from './schedule-period';
import { TimeOfDay } from './time-of-day';

export const BLOCK_END_BEFORE_START_MESSAGE =
  'O fim do bloqueio deve ser depois do início.';

// 24:00 lets a block run to the end of the day without becoming a day off.
const END_OF_DAY = '24:00';

export type BlockPeriodInput =
  | { kind: 'day_off'; localDate: string }
  | { kind: 'block'; localDate: string; start: string; end: string };

export class BlockPeriod {
  private constructor() {}

  static resolve(
    input: BlockPeriodInput,
    timezone: BarbershopTimezone,
  ): UtcPeriod {
    const day = SchedulePeriod.create({
      view: 'day',
      localDate: input.localDate,
      timezone,
    }).utc;
    if (input.kind === 'day_off') return day;

    const start = timezone.toUtc(
      input.localDate,
      TimeOfDay.create(input.start),
    );
    const end =
      input.end === END_OF_DAY
        ? day.end
        : timezone.toUtc(input.localDate, TimeOfDay.create(input.end));
    if (end.getTime() <= start.getTime()) {
      throw new InvalidValueError(BLOCK_END_BEFORE_START_MESSAGE);
    }
    return { start, end };
  }
}

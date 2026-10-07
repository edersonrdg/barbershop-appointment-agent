export const DAY_PERIODS = ['morning', 'afternoon', 'evening'] as const;

export type DayPeriod = (typeof DAY_PERIODS)[number];

const NOON_MINUTES = 12 * 60;
const EVENING_MINUTES = 18 * 60;

/** The period of a local time, in minutes since midnight. */
export function dayPeriodOf(minutes: number): DayPeriod {
  if (minutes < NOON_MINUTES) return 'morning';
  if (minutes < EVENING_MINUTES) return 'afternoon';
  return 'evening';
}

/**
 * Local time `HH:MM` at which the period ends; `null` when it ends at the end
 * of the day (the evening, or the whole day).
 */
export function dayPeriodEnd(period: DayPeriod | null): string | null {
  if (period === 'morning') return '12:00';
  if (period === 'afternoon') return '18:00';
  return null;
}

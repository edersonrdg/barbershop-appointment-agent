import { addCalendarMonth } from './calendar-date';

describe('US-20 calendar date', () => {
  it.each([
    ['2026-10-02', '2026-11-02', 'same day of the next month'],
    ['2026-01-31', '2026-02-28', 'the 31st into February'],
    ['2028-01-31', '2028-02-29', 'the 31st into a leap February'],
    ['2026-03-31', '2026-04-30', 'the 31st into a 30-day month'],
    ['2026-12-15', '2027-01-15', 'across the year'],
  ])('AC 9: %s plus one month is %s, %s (C2)', (date, expected) => {
    expect(addCalendarMonth(date)).toBe(expected);
  });
});

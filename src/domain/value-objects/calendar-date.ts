const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The same day one calendar month later, `YYYY-MM-DD`. A day the next month
 * does not have (29 to 31) becomes its last day.
 */
export function addCalendarMonth(date: string): string {
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error(`Not a calendar date: ${date}`);
  }
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return [
    String(nextYear).padStart(4, '0'),
    String(nextMonth).padStart(2, '0'),
    String(Math.min(day, lastDay)).padStart(2, '0'),
  ].join('-');
}

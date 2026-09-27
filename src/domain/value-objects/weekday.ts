export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Segunda-feira',
  tuesday: 'Terça-feira',
  wednesday: 'Quarta-feira',
  thursday: 'Quinta-feira',
  friday: 'Sexta-feira',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

export function isoWeekdayNumber(weekday: Weekday): number {
  return WEEKDAYS.indexOf(weekday) + 1;
}

export function weekdayFromIsoNumber(isoNumber: number): Weekday {
  return WEEKDAYS[isoNumber - 1];
}

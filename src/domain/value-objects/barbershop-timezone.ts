import { InvalidValueError } from '../errors/invalid-value.error';
import { TimeOfDay } from './time-of-day';
import { Weekday, weekdayFromIsoNumber } from './weekday';

export const BRAZILIAN_TIMEZONES = [
  'America/Noronha',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Araguaina',
  'America/Maceio',
  'America/Bahia',
  'America/Sao_Paulo',
  'America/Campo_Grande',
  'America/Cuiaba',
  'America/Santarem',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Manaus',
  'America/Eirunepe',
  'America/Rio_Branco',
] as const;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export class BarbershopTimezone {
  private constructor(private readonly zone: string) {}

  static create(raw: string): BarbershopTimezone {
    if (!BarbershopTimezone.isValid(raw)) {
      throw new InvalidValueError('Escolha um fuso horário do Brasil.');
    }
    return new BarbershopTimezone(raw);
  }

  static isValid(raw: string): boolean {
    return (BRAZILIAN_TIMEZONES as readonly string[]).includes(raw);
  }

  get value(): string {
    return this.zone;
  }

  toUtc(localDate: string, time: TimeOfDay): Date {
    const [year, month, day] = parseLocalDate(localDate);
    const wallClockAsUtc = Date.UTC(year, month - 1, day, 0, time.minutes);
    const offset = this.offsetAt(wallClockAsUtc);
    return new Date(wallClockAsUtc - offset);
  }

  weekdayOf(localDate: string): Weekday {
    const [year, month, day] = parseLocalDate(localDate);
    const sundayBased = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return weekdayFromIsoNumber(sundayBased === 0 ? 7 : sundayBased);
  }

  localDateOf(instant: Date): string {
    const part = this.partsAt(instant.getTime());
    const pad = (value: number, length: number): string =>
      String(value).padStart(length, '0');
    return `${pad(part('year'), 4)}-${pad(part('month'), 2)}-${pad(part('day'), 2)}`;
  }

  /** Wall-clock time of the instant, `HH:MM`. */
  localTimeOf(instant: Date): string {
    const part = this.partsAt(instant.getTime());
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${pad(part('hour'))}:${pad(part('minute'))}`;
  }

  private offsetAt(instant: number): number {
    const part = this.partsAt(instant);
    const localAsUtc = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
    );
    return localAsUtc - Math.floor(instant / 60_000) * 60_000;
  }

  private partsAt(
    instant: number,
  ): (type: Intl.DateTimeFormatPartTypes) => number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(instant));
    return (type) => Number(parts.find((p) => p.type === type)?.value);
  }
}

function parseLocalDate(localDate: string): [number, number, number] {
  const match = LOCAL_DATE_PATTERN.exec(localDate);
  if (!match) {
    throw new InvalidValueError('Data inválida.');
  }
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  // Date.UTC rolls 2026-02-30 over to March; a date that does not survive the
  // round trip does not exist in the calendar.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new InvalidValueError('Data inválida.');
  }
  return [year, month, day];
}

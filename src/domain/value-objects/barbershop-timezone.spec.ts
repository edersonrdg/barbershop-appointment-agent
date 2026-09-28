import { InvalidValueError } from '../errors/invalid-value.error';
import { BarbershopTimezone } from './barbershop-timezone';
import { TimeOfDay } from './time-of-day';

const BRAZILIAN_ZONES = [
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
];

describe('BarbershopTimezone', () => {
  describe('CA-03.3: only Brazilian timezones', () => {
    it.each(BRAZILIAN_ZONES)('accepts %s', (zone) => {
      expect(BarbershopTimezone.isValid(zone)).toBe(true);
      expect(BarbershopTimezone.create(zone).value).toBe(zone);
    });

    it.each(['Europe/Lisbon', 'UTC', 'qualquer coisa'])(
      'rejects %s with "Escolha um fuso horário do Brasil."',
      (zone) => {
        expect(BarbershopTimezone.isValid(zone)).toBe(false);
        expect(() => BarbershopTimezone.create(zone)).toThrow(
          new InvalidValueError('Escolha um fuso horário do Brasil.'),
        );
      },
    );
  });

  describe('CA-03.3: local wall-clock time to UTC', () => {
    it.each([
      ['America/Sao_Paulo', '2026-10-05T12:00:00.000Z'],
      ['America/Manaus', '2026-10-05T13:00:00.000Z'],
      ['America/Noronha', '2026-10-05T11:00:00.000Z'],
      ['America/Rio_Branco', '2026-10-05T14:00:00.000Z'],
    ])('09:00 on 2026-10-05 in %s is %s', (zone, expected) => {
      const utc = BarbershopTimezone.create(zone).toUtc(
        '2026-10-05',
        TimeOfDay.create('09:00'),
      );

      expect(utc.toISOString()).toBe(expected);
    });

    it('keeps the minutes: 23:59 in America/Sao_Paulo is 02:59Z on the next day', () => {
      const utc = BarbershopTimezone.create('America/Sao_Paulo').toUtc(
        '2026-10-05',
        TimeOfDay.create('23:59'),
      );

      expect(utc.toISOString()).toBe('2026-10-06T02:59:00.000Z');
    });
  });

  describe('CA-03.1: weekday of a local date', () => {
    const timezone = BarbershopTimezone.create('America/Sao_Paulo');

    it('2026-10-05 is a monday', () => {
      expect(timezone.weekdayOf('2026-10-05')).toBe('monday');
    });

    it('2026-10-04 is a sunday', () => {
      expect(timezone.weekdayOf('2026-10-04')).toBe('sunday');
    });
  });

  describe('AVL-09 · CA-07.1: local date of an instant', () => {
    it.each([
      ['America/Sao_Paulo', '2026-10-06T02:59:00.000Z', '2026-10-05'],
      ['America/Sao_Paulo', '2026-10-06T03:00:00.000Z', '2026-10-06'],
      ['America/Manaus', '2026-10-06T03:59:00.000Z', '2026-10-05'],
      ['America/Manaus', '2026-10-06T04:00:00.000Z', '2026-10-06'],
    ])('in %s, %s is on %s', (zone, instant, expected) => {
      expect(
        BarbershopTimezone.create(zone).localDateOf(new Date(instant)),
      ).toBe(expected);
    });
  });

  describe('CA-07.1: rejects local dates that do not exist', () => {
    const timezone = BarbershopTimezone.create('America/Sao_Paulo');

    it.each([
      '2026-02-30',
      '2026-13-01',
      '2026-9-1',
      '2026-00-10',
      '2026-04-31',
    ])('rejects %s with "Data inválida."', (localDate) => {
      expect(() =>
        timezone.toUtc(localDate, TimeOfDay.create('09:00')),
      ).toThrow(new InvalidValueError('Data inválida.'));
      expect(() => timezone.weekdayOf(localDate)).toThrow(
        new InvalidValueError('Data inválida.'),
      );
    });

    it('accepts 2028-02-29, a leap day', () => {
      expect(timezone.weekdayOf('2028-02-29')).toBe('tuesday');
    });
  });
});

import { InvalidOpeningHoursError } from '../errors/invalid-opening-hours.error';
import { DayOpeningHours } from './day-opening-hours';
import { TimeOfDay } from './time-of-day';

const t = (raw: string) => TimeOfDay.create(raw);

const CLOSING_MESSAGE =
  'Segunda-feira: o horário de fechamento deve ser depois do de abertura.';
const BREAK_MESSAGE =
  'Segunda-feira: o intervalo deve começar e terminar dentro do horário de funcionamento, com o fim depois do início.';

function monday(
  opensAt: string,
  closesAt: string,
  openingBreak?: { startsAt: string; endsAt: string },
): DayOpeningHours {
  return DayOpeningHours.create({
    weekday: 'monday',
    opensAt: t(opensAt),
    closesAt: t(closesAt),
    break: openingBreak
      ? { startsAt: t(openingBreak.startsAt), endsAt: t(openingBreak.endsAt) }
      : null,
  });
}

describe('DayOpeningHours', () => {
  describe('CA-03.2: closing must be after opening', () => {
    it('rejects closing before opening (18:00-09:00)', () => {
      expect(() => monday('18:00', '09:00')).toThrow(
        new InvalidOpeningHoursError(CLOSING_MESSAGE),
      );
    });

    it('rejects closing equal to opening (09:00-09:00)', () => {
      expect(() => monday('09:00', '09:00')).toThrow(
        new InvalidOpeningHoursError(CLOSING_MESSAGE),
      );
    });

    it('names the day in Portuguese in the message', () => {
      expect(() =>
        DayOpeningHours.create({
          weekday: 'saturday',
          opensAt: t('18:00'),
          closesAt: t('09:00'),
        }),
      ).toThrow(
        'Sábado: o horário de fechamento deve ser depois do de abertura.',
      );
    });

    it('throws InvalidOpeningHoursError carrying RF-32 as the violated rule', () => {
      expect.assertions(2);
      try {
        monday('18:00', '09:00');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidOpeningHoursError);
        expect((error as InvalidOpeningHoursError).rule).toBe('RF-32');
      }
    });

    it('accepts 00:00-23:59', () => {
      const day = monday('00:00', '23:59');

      expect(day.opensAt.toString()).toBe('00:00');
      expect(day.closesAt.toString()).toBe('23:59');
    });
  });

  describe('CA-03.2: break inside the opening hours', () => {
    it.each([
      ['starts at opening', '09:00', '10:00'],
      ['ends at closing', '18:00', '19:00'],
      ['starts before opening', '08:00', '10:00'],
      ['ends after closing', '18:00', '20:00'],
      ['ends before it starts', '13:00', '12:00'],
      ['ends when it starts', '12:00', '12:00'],
    ])('rejects a break that %s', (_case, startsAt, endsAt) => {
      expect(() => monday('09:00', '19:00', { startsAt, endsAt })).toThrow(
        new InvalidOpeningHoursError(BREAK_MESSAGE),
      );
    });
  });

  describe('CA-03.1: open periods of the day', () => {
    it('has one period [opening, closing) without a break', () => {
      const periods = monday('09:00', '19:00').openPeriods();

      expect(
        periods.map((p) => [p.start.toString(), p.end.toString()]),
      ).toEqual([['09:00', '19:00']]);
    });

    it('has two periods around the break', () => {
      const day = monday('09:00', '19:00', {
        startsAt: '12:00',
        endsAt: '13:00',
      });

      expect(day.break?.startsAt.toString()).toBe('12:00');
      expect(day.break?.endsAt.toString()).toBe('13:00');
      expect(
        day.openPeriods().map((p) => [p.start.toString(), p.end.toString()]),
      ).toEqual([
        ['09:00', '12:00'],
        ['13:00', '19:00'],
      ]);
    });
  });
});

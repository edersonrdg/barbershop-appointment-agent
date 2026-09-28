import { InvalidWorkingHoursError } from '../errors/invalid-working-hours.error';
import { DayWorkingHours } from './day-working-hours';
import { TimeOfDay } from './time-of-day';

const t = (raw: string) => TimeOfDay.create(raw);

const END_MESSAGE =
  'Segunda-feira: o fim da jornada deve ser depois do início.';
const BREAK_MESSAGE =
  'Segunda-feira: o intervalo deve começar e terminar dentro da jornada, com o fim depois do início.';

function monday(
  startsAt: string,
  endsAt: string,
  workBreak?: { startsAt: string; endsAt: string },
): DayWorkingHours {
  return DayWorkingHours.create({
    weekday: 'monday',
    startsAt: t(startsAt),
    endsAt: t(endsAt),
    break: workBreak
      ? { startsAt: t(workBreak.startsAt), endsAt: t(workBreak.endsAt) }
      : null,
  });
}

function describePeriods(day: DayWorkingHours) {
  return day.workPeriods().map((period) => ({
    start: period.start.toString(),
    end: period.end.toString(),
  }));
}

describe('DayWorkingHours', () => {
  describe('CA-05.1: the end of the working day must be after its start', () => {
    it('rejects an end before the start (18:00-09:00)', () => {
      expect(() => monday('18:00', '09:00')).toThrow(
        new InvalidWorkingHoursError(END_MESSAGE),
      );
    });

    it('rejects an end equal to the start (09:00-09:00)', () => {
      expect(() => monday('09:00', '09:00')).toThrow(
        new InvalidWorkingHoursError(END_MESSAGE),
      );
    });

    it('accepts an end one minute after the start', () => {
      expect(describePeriods(monday('09:00', '09:01'))).toEqual([
        { start: '09:00', end: '09:01' },
      ]);
    });

    it('names the day in Portuguese in the message', () => {
      expect(() =>
        DayWorkingHours.create({
          weekday: 'sunday',
          startsAt: t('18:00'),
          endsAt: t('09:00'),
        }),
      ).toThrow('Domingo: o fim da jornada deve ser depois do início.');
    });

    it('throws InvalidWorkingHoursError carrying RF-34 as the violated rule', () => {
      expect.assertions(2);
      try {
        monday('18:00', '09:00');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidWorkingHoursError);
        expect((error as InvalidWorkingHoursError).rule).toBe('RF-34');
      }
    });
  });

  describe('CA-05.1: the break must lie strictly inside the working day', () => {
    it.each([
      ['starts at the start of the day', '09:00', '12:00'],
      ['starts before the start of the day', '08:00', '12:00'],
      ['ends at the end of the day', '17:00', '18:00'],
      ['ends after the end of the day', '17:00', '19:00'],
      ['ends at its own start', '12:00', '12:00'],
      ['ends before its own start', '13:00', '12:00'],
    ])('rejects a break that %s', (_case, startsAt, endsAt) => {
      expect(() => monday('09:00', '18:00', { startsAt, endsAt })).toThrow(
        new InvalidWorkingHoursError(BREAK_MESSAGE),
      );
    });

    it('accepts a break one minute inside each limit', () => {
      expect(
        describePeriods(
          monday('09:00', '18:00', { startsAt: '09:01', endsAt: '17:59' }),
        ),
      ).toEqual([
        { start: '09:00', end: '09:01' },
        { start: '17:59', end: '18:00' },
      ]);
    });
  });

  describe('CA-05.1: work periods', () => {
    it('is one period from start to end without a break', () => {
      const day = monday('09:00', '18:00');

      expect(day.break).toBeNull();
      expect(describePeriods(day)).toEqual([{ start: '09:00', end: '18:00' }]);
    });

    it('is two periods around the break', () => {
      const day = monday('09:00', '18:00', {
        startsAt: '12:00',
        endsAt: '13:00',
      });

      expect(describePeriods(day)).toEqual([
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '18:00' },
      ]);
    });

    it('keeps weekday, start, end and break as given', () => {
      const day = monday('08:30', '17:45', {
        startsAt: '12:15',
        endsAt: '13:00',
      });

      expect({
        weekday: day.weekday,
        startsAt: day.startsAt.toString(),
        endsAt: day.endsAt.toString(),
        break: day.break && {
          startsAt: day.break.startsAt.toString(),
          endsAt: day.break.endsAt.toString(),
        },
      }).toEqual({
        weekday: 'monday',
        startsAt: '08:30',
        endsAt: '17:45',
        break: { startsAt: '12:15', endsAt: '13:00' },
      });
    });
  });
});

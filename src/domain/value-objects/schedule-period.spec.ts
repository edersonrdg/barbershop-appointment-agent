import { InvalidValueError } from '../errors/invalid-value.error';
import { BarbershopTimezone } from './barbershop-timezone';
import { SchedulePeriod } from './schedule-period';

const SAO_PAULO = BarbershopTimezone.create('America/Sao_Paulo');

describe('SchedulePeriod', () => {
  describe('CA-08.1: day view', () => {
    it('covers the local day from midnight to the next midnight in UTC', () => {
      const period = SchedulePeriod.create({
        view: 'day',
        localDate: '2026-09-30',
        timezone: SAO_PAULO,
      });

      expect(period.view).toBe('day');
      expect(period.startDate).toBe('2026-09-30');
      expect(period.endDate).toBe('2026-09-30');
      expect(period.utc.start.toISOString()).toBe('2026-09-30T03:00:00.000Z');
      expect(period.utc.end.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    });

    it('uses the barbershop timezone: midnight in Manaus is 04:00Z', () => {
      const period = SchedulePeriod.create({
        view: 'day',
        localDate: '2026-09-30',
        timezone: BarbershopTimezone.create('America/Manaus'),
      });

      expect(period.utc.start.toISOString()).toBe('2026-09-30T04:00:00.000Z');
      expect(period.utc.end.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    });

    it('rolls over the month end', () => {
      const period = SchedulePeriod.create({
        view: 'day',
        localDate: '2026-02-28',
        timezone: SAO_PAULO,
      });

      expect(period.utc.end.toISOString()).toBe('2026-03-01T03:00:00.000Z');
    });
  });

  describe('CA-08.1: week view from Monday to Sunday', () => {
    it.each([
      ['a Wednesday', '2026-09-30'],
      ['the Monday itself', '2026-09-28'],
      ['a Sunday, closing the week', '2026-10-04'],
    ])('on %s covers Monday 2026-09-28 to Sunday 2026-10-04', (_, date) => {
      const period = SchedulePeriod.create({
        view: 'week',
        localDate: date,
        timezone: SAO_PAULO,
      });

      expect(period.view).toBe('week');
      expect(period.startDate).toBe('2026-09-28');
      expect(period.endDate).toBe('2026-10-04');
      expect(period.utc.start.toISOString()).toBe('2026-09-28T03:00:00.000Z');
      expect(period.utc.end.toISOString()).toBe('2026-10-05T03:00:00.000Z');
    });

    it('crosses the year: Thursday 2026-12-31 is in 2026-12-28 to 2027-01-03', () => {
      const period = SchedulePeriod.create({
        view: 'week',
        localDate: '2026-12-31',
        timezone: SAO_PAULO,
      });

      expect(period.startDate).toBe('2026-12-28');
      expect(period.endDate).toBe('2027-01-03');
      expect(period.utc.start.toISOString()).toBe('2026-12-28T03:00:00.000Z');
      expect(period.utc.end.toISOString()).toBe('2027-01-04T03:00:00.000Z');
    });
  });

  describe('AGD-24: invalid date', () => {
    it.each(['2026-02-30', '30/09/2026', '2026-9-30'])(
      'rejects %s with "Data inválida."',
      (date) => {
        expect(() =>
          SchedulePeriod.create({
            view: 'day',
            localDate: date,
            timezone: SAO_PAULO,
          }),
        ).toThrow(new InvalidValueError('Data inválida.'));
      },
    );
  });
});

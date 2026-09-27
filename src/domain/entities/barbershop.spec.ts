import { BarbershopTimezone } from '../value-objects/barbershop-timezone';
import { DayOpeningHours } from '../value-objects/day-opening-hours';
import { TimeOfDay } from '../value-objects/time-of-day';
import { WEEKDAYS } from '../value-objects/weekday';
import { WeeklyOpeningHours } from '../value-objects/weekly-opening-hours';
import { Barbershop } from './barbershop';

const t = (raw: string) => TimeOfDay.create(raw);

// 2026-10-05 is a monday; 2026-10-06 a tuesday; 2026-10-04 a sunday.
const WEEK = WeeklyOpeningHours.create({
  monday: DayOpeningHours.create({
    weekday: 'monday',
    opensAt: t('09:00'),
    closesAt: t('19:00'),
    break: { startsAt: t('12:00'), endsAt: t('13:00') },
  }),
  tuesday: DayOpeningHours.create({
    weekday: 'tuesday',
    opensAt: t('09:00'),
    closesAt: t('19:00'),
  }),
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
});

function newBarbershop(): Barbershop {
  return Barbershop.startTrial({
    id: 'barbershop-1',
    name: 'Barbearia do Zé',
    now: new Date('2026-09-27T12:00:00.000Z'),
  });
}

function configured(timezone: string): Barbershop {
  const barbershop = newBarbershop();
  barbershop.updateSettings({
    name: 'Barbearia do Zé',
    address: 'Rua das Flores, 123 - Centro, Campinas/SP',
    timezone: BarbershopTimezone.create(timezone),
    openingHours: WEEK,
  });
  return barbershop;
}

const iso = (periods: { start: Date; end: Date }[]) =>
  periods.map((p) => [p.start.toISOString(), p.end.toISOString()]);

describe('Barbershop', () => {
  describe('CA-01.2: 14-day free trial', () => {
    it('ends the trial exactly 14 days (14 x 86 400 000 ms) after signup, with status trialing', () => {
      const now = new Date('2026-09-27T12:00:00.000Z');

      const barbershop = Barbershop.startTrial({
        id: 'barbershop-1',
        name: 'Barbearia do Zé',
        now,
      });

      expect(barbershop.subscriptionStatus).toBe('trialing');
      expect(barbershop.trialEndsAt.getTime() - now.getTime()).toBe(
        14 * 24 * 60 * 60 * 1000,
      );
    });

    it('defaults the timezone to America/Sao_Paulo (RNF-04)', () => {
      const barbershop = Barbershop.startTrial({
        id: 'barbershop-1',
        name: 'Barbearia do Zé',
        now: new Date('2026-09-27T12:00:00.000Z'),
      });

      expect(barbershop.timezone).toBe('America/Sao_Paulo');
    });
  });

  describe('CA-03.1: settings of a barbershop that never saved them', () => {
    it('has no address and all 7 days closed', () => {
      const barbershop = newBarbershop();

      expect(barbershop.address).toBeNull();
      expect(
        WEEKDAYS.map((weekday) => barbershop.openingHours.forDay(weekday)),
      ).toEqual([null, null, null, null, null, null, null]);
      expect(barbershop.openIntervalsOn('2026-10-05')).toEqual([]);
    });
  });

  describe('CA-03.1: open periods of a local date in UTC', () => {
    const barbershop = configured('America/Sao_Paulo');

    it('splits a monday 09:00-19:00 with a 12:00-13:00 break into 12:00Z-15:00Z and 16:00Z-22:00Z', () => {
      expect(iso(barbershop.openIntervalsOn('2026-10-05'))).toEqual([
        ['2026-10-05T12:00:00.000Z', '2026-10-05T15:00:00.000Z'],
        ['2026-10-05T16:00:00.000Z', '2026-10-05T22:00:00.000Z'],
      ]);
    });

    it('returns a single period for a day without a break', () => {
      expect(iso(barbershop.openIntervalsOn('2026-10-06'))).toEqual([
        ['2026-10-06T12:00:00.000Z', '2026-10-06T22:00:00.000Z'],
      ]);
    });

    it('returns no period for a closed day', () => {
      expect(barbershop.openIntervalsOn('2026-10-04')).toEqual([]);
    });
  });

  describe('CA-03.3: timezone of the barbershop', () => {
    it('computes the periods in the new timezone with the same local hours', () => {
      const barbershop = configured('America/Manaus');

      expect(barbershop.timezone).toBe('America/Manaus');
      expect(barbershop.name).toBe('Barbearia do Zé');
      expect(barbershop.address).toBe(
        'Rua das Flores, 123 - Centro, Campinas/SP',
      );
      expect(iso(barbershop.openIntervalsOn('2026-10-05'))).toEqual([
        ['2026-10-05T13:00:00.000Z', '2026-10-05T16:00:00.000Z'],
        ['2026-10-05T17:00:00.000Z', '2026-10-05T23:00:00.000Z'],
      ]);
    });
  });
});

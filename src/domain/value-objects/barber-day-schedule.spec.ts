import { UtcPeriod } from '../entities/barbershop';
import { AvailableSlot, BarberDaySchedule } from './barber-day-schedule';

// Local wall-clock time on 2026-10-05 in America/Sao_Paulo (UTC-3).
const at = (time: string): Date => new Date(`2026-10-05T${time}:00-03:00`);
const period = (start: string, end: string): UtcPeriod => ({
  start: at(start),
  end: at(end),
});
const MIDNIGHT = at('00:00');

function schedule({
  open = [period('09:00', '18:00')],
  work = [period('09:00', '18:00')],
  blocks = [],
  appointments = [],
}: {
  open?: UtcPeriod[];
  work?: UtcPeriod[];
  blocks?: UtcPeriod[];
  appointments?: UtcPeriod[];
} = {}): BarberDaySchedule {
  return BarberDaySchedule.create({
    barberId: 'barber-1',
    openPeriods: open,
    workPeriods: work,
    blocks,
    appointments,
  });
}

const starts = (slots: AvailableSlot[]): Date[] =>
  slots.map((slot) => slot.startsAt);

describe('BarberDaySchedule', () => {
  describe('offer', () => {
    // Independent Test of the spec: shop 09:00-18:00 with a 12:00-13:00 break,
    // barber 10:00-17:00, 30 + 15 min, appointment 14:00-14:45, block 15:30-16:00.
    const independentTest = () =>
      schedule({
        open: [period('09:00', '12:00'), period('13:00', '18:00')],
        work: [period('10:00', '17:00')],
        appointments: [period('14:00', '14:45')],
        blocks: [period('15:30', '16:00')],
      });

    it('CA-07.1: offers only the starts that fit inside opening, working hours and outside busy periods (AVL-01, AVL-03 to AVL-05, AVL-08)', () => {
      const slots = independentTest().offer(45, MIDNIGHT);

      expect(slots).toEqual([
        { barberId: 'barber-1', startsAt: at('10:00'), endsAt: at('10:45') },
        { barberId: 'barber-1', startsAt: at('10:30'), endsAt: at('11:15') },
        { barberId: 'barber-1', startsAt: at('11:00'), endsAt: at('11:45') },
        { barberId: 'barber-1', startsAt: at('13:00'), endsAt: at('13:45') },
        { barberId: 'barber-1', startsAt: at('14:45'), endsAt: at('15:30') },
        { barberId: 'barber-1', startsAt: at('16:00'), endsAt: at('16:45') },
      ]);
    });

    it('CA-07.1: every offered start is accepted by violationOf (AVL-27)', () => {
      const day = independentTest();

      const violations = day
        .offer(45, MIDNIGHT)
        .map((slot) =>
          day.violationOf({ start: slot.startsAt, end: slot.endsAt }),
        );

      expect(violations).toEqual([null, null, null, null, null, null]);
    });

    it('CA-07.1: the grid starts at the opening when the working day starts earlier', () => {
      const slots = schedule({
        open: [period('09:00', '10:00')],
        work: [period('08:00', '12:00')],
      }).offer(30, MIDNIGHT);

      expect(starts(slots)).toEqual([at('09:00'), at('09:30')]);
    });

    it('CA-07.1: a free period shorter than the duration offers nothing', () => {
      const slots = schedule({ open: [period('09:00', '09:40')] }).offer(
        45,
        MIDNIGHT,
      );

      expect(slots).toEqual([]);
    });

    it('CA-07.1: an appointment or block that ends when the start begins, or begins when it ends, keeps the start (AVL-06)', () => {
      const slots = schedule({
        open: [period('09:00', '12:00')],
        appointments: [period('09:00', '10:00')],
        blocks: [period('11:00', '12:00')],
      }).offer(60, MIDNIGHT);

      expect(starts(slots)).toEqual([at('10:00')]);
    });

    it('CA-07.1: an appointment overlapping the interval by 1 minute removes the start (AVL-05)', () => {
      const slots = schedule({
        open: [period('09:00', '12:00')],
        appointments: [period('10:29', '11:00')],
      }).offer(30, MIDNIGHT);

      expect(starts(slots)).toEqual([
        at('09:00'),
        at('09:30'),
        at('11:00'),
        at('11:30'),
      ]);
    });

    it('CA-07.1: a block overlapping the interval by 1 minute removes the start (AVL-04)', () => {
      const slots = schedule({
        open: [period('09:00', '12:00')],
        blocks: [period('10:29', '11:00')],
      }).offer(30, MIDNIGHT);

      expect(starts(slots)).toEqual([
        at('09:00'),
        at('09:30'),
        at('11:00'),
        at('11:30'),
      ]);
    });

    it('CA-07.1: a closed day or a day without working hours offers nothing (AVL-07)', () => {
      expect(schedule({ open: [] }).offer(30, MIDNIGHT)).toEqual([]);
      expect(schedule({ work: [] }).offer(30, MIDNIGHT)).toEqual([]);
    });

    it('CA-07.1: returns the starts in ascending order whatever the order of the periods (AVL-08)', () => {
      const slots = schedule({
        open: [period('13:00', '14:00'), period('09:00', '10:00')],
      }).offer(30, MIDNIGHT);

      expect(starts(slots)).toEqual([
        at('09:00'),
        at('09:30'),
        at('13:00'),
        at('13:30'),
      ]);
    });

    it('CA-07.3: a start exactly at the earliest instant is offered (AVL-16)', () => {
      const slots = schedule({ open: [period('09:00', '11:00')] }).offer(
        30,
        at('10:00'),
      );

      expect(starts(slots)).toEqual([at('10:00'), at('10:30')]);
    });

    it('CA-07.3: an earliest instant 1 minute after a grid start removes that start and keeps the grid (AVL-14, AVL-15)', () => {
      const slots = schedule({ open: [period('09:00', '11:00')] }).offer(
        30,
        at('10:01'),
      );

      expect(starts(slots)).toEqual([at('10:30')]);
    });
  });

  describe('violationOf', () => {
    const day = () =>
      schedule({
        open: [period('09:00', '12:00'), period('13:00', '18:00')],
        work: [period('10:00', '17:00')],
        blocks: [period('15:00', '16:00')],
        appointments: [period('14:00', '14:45')],
      });

    it('CA-07.5: an interval crossing the opening break is outside the opening hours (AVL-21)', () => {
      expect(day().violationOf(period('11:30', '12:30'))).toBe(
        'outside-opening-hours',
      );
    });

    it('CA-07.5: an interval inside the opening hours but before the working day is outside the working hours (AVL-22)', () => {
      expect(day().violationOf(period('09:30', '10:30'))).toBe(
        'outside-working-hours',
      );
    });

    it('CA-07.5: an interval overlapping a block is blocked (AVL-23)', () => {
      expect(day().violationOf(period('15:45', '16:15'))).toBe('blocked');
    });

    it('CA-07.5: an interval overlapping a confirmed appointment overlaps (AVL-24)', () => {
      expect(day().violationOf(period('14:30', '15:00'))).toBe('overlap');
    });

    it('CA-07.5: an interval touching the appointment and the block has no violation (AVL-06)', () => {
      expect(day().violationOf(period('14:45', '15:00'))).toBeNull();
    });

    it('CA-07.5: with several violations, reports the first in the order opening, working, block, overlap (AVL-25)', () => {
      const everything = schedule({
        open: [period('09:00', '10:00')],
        work: [period('09:00', '09:30')],
        blocks: [period('10:00', '11:00')],
        appointments: [period('10:00', '11:00')],
      });
      const workingBlockAndOverlap = schedule({
        work: [period('09:00', '10:00')],
        blocks: [period('10:00', '11:00')],
        appointments: [period('10:00', '11:00')],
      });
      const blockAndOverlap = schedule({
        blocks: [period('10:00', '11:00')],
        appointments: [period('10:00', '11:00')],
      });

      expect(everything.violationOf(period('09:30', '10:30'))).toBe(
        'outside-opening-hours',
      );
      expect(workingBlockAndOverlap.violationOf(period('09:30', '10:30'))).toBe(
        'outside-working-hours',
      );
      expect(blockAndOverlap.violationOf(period('09:30', '10:30'))).toBe(
        'blocked',
      );
    });
  });

  describe('occupancy', () => {
    it('CA-26.1 (C5): available time is work within opening hours minus blocks', () => {
      const occupancy = schedule({
        open: [period('09:00', '18:00')],
        work: [period('08:00', '12:00')],
        blocks: [period('09:00', '10:00')],
      }).occupancy();

      expect(occupancy).toEqual({ availableMinutes: 120, bookedMinutes: 0 });
    });

    it('CA-26.1 (C5): booked minutes count only the part inside the available time', () => {
      const occupancy = schedule({
        open: [period('09:00', '18:00')],
        work: [period('09:00', '12:00')],
        blocks: [period('09:00', '10:00')],
        appointments: [
          period('10:00', '10:30'),
          period('11:30', '12:30'),
          period('09:00', '09:30'),
        ],
      }).occupancy();

      expect(occupancy).toEqual({ availableMinutes: 120, bookedMinutes: 60 });
    });

    it('CA-26.1 (C6): a closed day has no available minutes', () => {
      const occupancy = schedule({
        open: [],
        appointments: [period('10:00', '10:30')],
      }).occupancy();

      expect(occupancy).toEqual({ availableMinutes: 0, bookedMinutes: 0 });
    });
  });
});

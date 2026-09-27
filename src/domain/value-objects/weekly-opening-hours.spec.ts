import { DayOpeningHours } from './day-opening-hours';
import { TimeOfDay } from './time-of-day';
import { WEEKDAYS } from './weekday';
import { WeeklyOpeningHours } from './weekly-opening-hours';

describe('WeeklyOpeningHours', () => {
  it('CA-03.1: starts with all 7 days closed', () => {
    const week = WeeklyOpeningHours.allClosed();

    expect(WEEKDAYS.map((weekday) => week.forDay(weekday))).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  describe('CA-03.1: open and closed days', () => {
    const monday = DayOpeningHours.create({
      weekday: 'monday',
      opensAt: TimeOfDay.create('09:00'),
      closesAt: TimeOfDay.create('19:00'),
    });
    const week = WeeklyOpeningHours.create({
      monday,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    });

    it('returns the opening hours of an open day', () => {
      expect(week.forDay('monday')).toBe(monday);
    });

    it('returns null for a closed day', () => {
      expect(week.forDay('sunday')).toBeNull();
    });
  });
});

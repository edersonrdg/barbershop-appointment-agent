import { InvalidValueError } from '../errors/invalid-value.error';
import { TimeOfDay } from './time-of-day';

describe('TimeOfDay', () => {
  describe('CA-03.2: HH:mm between 00:00 and 23:59', () => {
    it.each(['00:00', '23:59', '09:30'])('accepts "%s"', (raw) => {
      expect(TimeOfDay.isValid(raw)).toBe(true);
      expect(TimeOfDay.create(raw).toString()).toBe(raw);
    });

    it.each(['24:00', '9:00', '09:60', '09:00:00', 'nove horas', ''])(
      'rejects "%s"',
      (raw) => {
        expect(TimeOfDay.isValid(raw)).toBe(false);
        expect(() => TimeOfDay.create(raw)).toThrow(InvalidValueError);
      },
    );
  });

  it('CA-03.2: counts the minutes since midnight', () => {
    expect(TimeOfDay.create('09:30').minutes).toBe(570);
    expect(TimeOfDay.create('00:00').minutes).toBe(0);
    expect(TimeOfDay.create('23:59').minutes).toBe(1439);
  });
});

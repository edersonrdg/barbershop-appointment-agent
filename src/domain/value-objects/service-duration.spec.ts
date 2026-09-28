import { InvalidValueError } from '../errors/invalid-value.error';
import { ServiceDuration } from './service-duration';

describe('ServiceDuration', () => {
  describe('CA-04.4: integer minutes from 5 to 480, in multiples of 5', () => {
    it.each([5, 480, 30])('accepts %p', (minutes) => {
      expect(ServiceDuration.isValid(minutes)).toBe(true);
      expect(ServiceDuration.create(minutes).minutes).toBe(minutes);
    });

    it.each([0, 4, 485, 7, 30.5, Number.NaN])(
      'rejects %p with InvalidValueError',
      (minutes) => {
        expect(ServiceDuration.isValid(minutes)).toBe(false);
        expect(() => ServiceDuration.create(minutes)).toThrow(
          InvalidValueError,
        );
      },
    );
  });
});

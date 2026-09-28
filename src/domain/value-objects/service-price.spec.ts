import { InvalidValueError } from '../errors/invalid-value.error';
import { ServicePrice } from './service-price';

describe('ServicePrice', () => {
  describe('CA-04.4: integer cents from 0 to 1,000,000', () => {
    it.each([0, 1_000_000, 4500])('accepts %p', (cents) => {
      expect(ServicePrice.isValid(cents)).toBe(true);
      expect(ServicePrice.create(cents).cents).toBe(cents);
    });

    it.each([-1, 1_000_001, 45.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'rejects %p with InvalidValueError',
      (cents) => {
        expect(ServicePrice.isValid(cents)).toBe(false);
        expect(() => ServicePrice.create(cents)).toThrow(InvalidValueError);
      },
    );
  });
});

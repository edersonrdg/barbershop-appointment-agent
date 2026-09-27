import { InvalidValueError } from '../errors/invalid-value.error';
import { PhoneNumber } from './phone-number';

describe('PhoneNumber', () => {
  describe('ACC-03: normalization to E.164', () => {
    it('normalizes "(11) 91234-5678" to "+5511912345678"', () => {
      expect(PhoneNumber.create('(11) 91234-5678').value).toBe(
        '+5511912345678',
      );
    });

    it('normalizes "+55 11 91234-5678" to "+5511912345678"', () => {
      expect(PhoneNumber.create('+55 11 91234-5678').value).toBe(
        '+5511912345678',
      );
    });

    it('normalizes "(11) 3123-4567" (fixed line) to "+551131234567"', () => {
      expect(PhoneNumber.create('(11) 3123-4567').value).toBe('+551131234567');
    });
  });

  describe('ACC-03: validation of Brazilian phone numbers', () => {
    it('rejects DDD "00"', () => {
      expect(PhoneNumber.isValid('(00) 91234-5678')).toBe(false);
      expect(() => PhoneNumber.create('(00) 91234-5678')).toThrow(
        InvalidValueError,
      );
    });

    it('rejects an 11-digit mobile number without a leading 9', () => {
      expect(PhoneNumber.isValid('(11) 81234-5678')).toBe(false);
      expect(() => PhoneNumber.create('(11) 81234-5678')).toThrow(
        InvalidValueError,
      );
    });

    it('rejects fewer than 10 digits', () => {
      expect(PhoneNumber.isValid('123456789')).toBe(false);
      expect(() => PhoneNumber.create('123456789')).toThrow(InvalidValueError);
    });

    it('rejects a value containing letters', () => {
      expect(PhoneNumber.isValid('(11) 9abc4-5678')).toBe(false);
      expect(() => PhoneNumber.create('(11) 9abc4-5678')).toThrow(
        InvalidValueError,
      );
    });
  });
});

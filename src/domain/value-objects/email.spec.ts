import { InvalidValueError } from '../errors/invalid-value.error';
import { Email } from './email';

describe('Email', () => {
  describe('ACC-06: normalization (trim + lowercase)', () => {
    it('normalizes "  Dono@Barbearia.COM " to "dono@barbearia.com"', () => {
      expect(Email.create('  Dono@Barbearia.COM ').value).toBe(
        'dono@barbearia.com',
      );
    });

    it('isValid also normalizes before checking', () => {
      expect(Email.isValid('  Dono@Barbearia.COM ')).toBe(true);
    });
  });

  describe('ACC-03: validation of format and length', () => {
    it('rejects an email without "@"', () => {
      expect(Email.isValid('donobarbearia.com')).toBe(false);
      expect(() => Email.create('donobarbearia.com')).toThrow(
        InvalidValueError,
      );
    });

    it('rejects an email without a domain', () => {
      expect(Email.isValid('dono@')).toBe(false);
      expect(() => Email.create('dono@')).toThrow(InvalidValueError);
    });

    it('rejects an empty email', () => {
      expect(Email.isValid('')).toBe(false);
      expect(() => Email.create('')).toThrow(InvalidValueError);
    });

    it('rejects an email longer than 254 characters', () => {
      const tooLong = `${'a'.repeat(250)}@ab.co`;
      expect(tooLong.length).toBeGreaterThan(254);
      expect(Email.isValid(tooLong)).toBe(false);
      expect(() => Email.create(tooLong)).toThrow(InvalidValueError);
    });

    it('accepts an email at exactly 254 characters', () => {
      const local = 'a'.repeat(248);
      const exactly254 = `${local}@ab.co`;
      expect(exactly254.length).toBe(254);
      expect(Email.isValid(exactly254)).toBe(true);
    });
  });
});

import { InvalidValueError } from '../errors/invalid-value.error';
import { BookingRules, BookingRulesProps } from './booking-rules';

const VALID: BookingRulesProps = {
  minimumAdvanceMinutes: 30,
  cancellationDeadlineMinutes: 240,
  noShowLimit: 3,
  waitlistOfferMinutes: 20,
  returnReminderDays: 45,
};

function toPlain(rules: BookingRules): BookingRulesProps {
  return {
    minimumAdvanceMinutes: rules.minimumAdvanceMinutes,
    cancellationDeadlineMinutes: rules.cancellationDeadlineMinutes,
    noShowLimit: rules.noShowLimit,
    waitlistOfferMinutes: rules.waitlistOfferMinutes,
    returnReminderDays: rules.returnReminderDays,
  };
}

describe('BookingRules', () => {
  it('CA-06.1: defaults are 60 min advance, 120 min cancellation, 2 no-shows, 15 min offer and 30 days return', () => {
    expect(toPlain(BookingRules.defaults())).toEqual({
      minimumAdvanceMinutes: 60,
      cancellationDeadlineMinutes: 120,
      noShowLimit: 2,
      waitlistOfferMinutes: 15,
      returnReminderDays: 30,
    });
  });

  it('CA-06.2: keeps the five values it was created with', () => {
    expect(toPlain(BookingRules.create(VALID))).toEqual(VALID);
  });

  it('CA-06.2: accepts 0 for minimum advance and cancellation deadline', () => {
    const rules = BookingRules.create({
      ...VALID,
      minimumAdvanceMinutes: 0,
      cancellationDeadlineMinutes: 0,
    });

    expect(rules.minimumAdvanceMinutes).toBe(0);
    expect(rules.cancellationDeadlineMinutes).toBe(0);
  });

  describe('CA-06.3: accepts each exact limit', () => {
    it.each<[keyof BookingRulesProps, number]>([
      ['minimumAdvanceMinutes', 0],
      ['minimumAdvanceMinutes', 10080],
      ['cancellationDeadlineMinutes', 0],
      ['cancellationDeadlineMinutes', 10080],
      ['noShowLimit', 1],
      ['noShowLimit', 10],
      ['waitlistOfferMinutes', 5],
      ['waitlistOfferMinutes', 120],
      ['returnReminderDays', 7],
      ['returnReminderDays', 365],
    ])('%s = %p', (field, value) => {
      const props = { ...VALID, [field]: value };

      expect(BookingRules.isValid(props)).toBe(true);
      expect(BookingRules.create(props)[field]).toBe(value);
    });
  });

  describe('CA-06.3: rejects negative, out-of-range and non-integer values with InvalidValueError', () => {
    it.each<[keyof BookingRulesProps, number]>([
      ['minimumAdvanceMinutes', -5],
      ['minimumAdvanceMinutes', 10085],
      ['minimumAdvanceMinutes', 7],
      ['minimumAdvanceMinutes', 60.5],
      ['cancellationDeadlineMinutes', -5],
      ['cancellationDeadlineMinutes', 10085],
      ['cancellationDeadlineMinutes', 7],
      ['cancellationDeadlineMinutes', 120.5],
      ['noShowLimit', -1],
      ['noShowLimit', 0],
      ['noShowLimit', 11],
      ['noShowLimit', 2.5],
      ['waitlistOfferMinutes', -5],
      ['waitlistOfferMinutes', 4],
      ['waitlistOfferMinutes', 121],
      ['waitlistOfferMinutes', 15.5],
      ['returnReminderDays', -7],
      ['returnReminderDays', 6],
      ['returnReminderDays', 366],
      ['returnReminderDays', 30.5],
      ['returnReminderDays', Number.NaN],
    ])('%s = %p', (field, value) => {
      const props = { ...VALID, [field]: value };

      expect(BookingRules.isValid(props)).toBe(false);
      expect(() => BookingRules.create(props)).toThrow(InvalidValueError);
    });
  });

  describe('blocksSelfBooking', () => {
    const withLimit = (noShowLimit: number) =>
      BookingRules.create({ ...VALID, noShowLimit });

    it.each([
      [1, false],
      [2, true],
      [3, true],
    ])(
      'CA-11.2: with limit 2, %i no-shows blocks self-booking: %s (RN-12, ATD-08, ATD-09)',
      (noShowCount, blocked) => {
        expect(withLimit(2).blocksSelfBooking(noShowCount)).toBe(blocked);
      },
    );

    it.each([
      [0, false],
      [1, true],
    ])(
      'CA-11.2: with limit 1, %i no-shows blocks self-booking: %s (RN-12)',
      (noShowCount, blocked) => {
        expect(withLimit(1).blocksSelfBooking(noShowCount)).toBe(blocked);
      },
    );

    it('RN-12: follows the current limit when it changes (ATD-10)', () => {
      expect(withLimit(2).blocksSelfBooking(2)).toBe(true);
      expect(withLimit(3).blocksSelfBooking(2)).toBe(false);
    });
  });
});

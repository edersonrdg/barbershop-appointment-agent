import { NO_SHOW_RESET_DAYS, noShowResetCutoff } from './no-show-reset';

describe('noShowResetCutoff', () => {
  it('RN-13: the reset period is 90 days', () => {
    expect(NO_SHOW_RESET_DAYS).toBe(90);
  });

  it('CA-11.3: the cutoff is exactly 90 days before now (ATD-23, ATD-24)', () => {
    expect(
      noShowResetCutoff(new Date('2026-12-30T12:00:00.000Z')).toISOString(),
    ).toBe('2026-10-01T12:00:00.000Z');
  });
});

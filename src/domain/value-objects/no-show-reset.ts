const MS_PER_DAY = 24 * 60 * 60 * 1000;

// RN-13: 90 days without a new no-show forgive the client. The PRD fixes the
// period, so it is not a per-barbershop rule.
export const NO_SHOW_RESET_DAYS = 90;

export function noShowResetCutoff(now: Date): Date {
  return new Date(now.getTime() - NO_SHOW_RESET_DAYS * MS_PER_DAY);
}

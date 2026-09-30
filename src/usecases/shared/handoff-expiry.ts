const HOUR_MS = 60 * 60 * 1000;

// RN-23: a pause whose latest activity is at or before this instant no longer
// holds, so the bot answers the client again (door 3).
export function handoffExpiredBefore(
  now: Date,
  resumeAfterHours: number,
): Date {
  return new Date(now.getTime() - resumeAfterHours * HOUR_MS);
}

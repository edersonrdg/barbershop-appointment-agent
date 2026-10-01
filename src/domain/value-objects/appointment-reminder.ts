import type { AppointmentStatus } from '../entities/appointment';

const MS_PER_MINUTE = 60 * 1000;

export const REMINDER_KINDS = ['24h', '1h'] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

const LEAD_MINUTES: Record<ReminderKind, number> = { '24h': 24 * 60, '1h': 60 };

// A late reminder still goes out while it makes sense: the 24h one until the
// 1h one is due, the 1h one until the appointment starts, so both never go out
// in the same run (US-19).
const WINDOW_END_MINUTES: Record<ReminderKind, number> = { '24h': 60, '1h': 0 };

export function reminderLeadMinutes(kind: ReminderKind): number {
  return LEAD_MINUTES[kind];
}

export interface ReminderTiming {
  startsAt: Date;
  createdAt: Date;
}

// RN-18 and CA-19.4: an appointment created after the moment of a reminder
// never gets that reminder.
export function isReminderDue(
  kind: ReminderKind,
  { startsAt, createdAt }: ReminderTiming,
  now: Date,
): boolean {
  const moment = startsAt.getTime() - LEAD_MINUTES[kind] * MS_PER_MINUTE;
  const windowEnd =
    startsAt.getTime() - WINDOW_END_MINUTES[kind] * MS_PER_MINUTE;
  return (
    createdAt.getTime() <= moment &&
    moment <= now.getTime() &&
    now.getTime() < windowEnd
  );
}

export interface ClientConfirmationState {
  status: AppointmentStatus;
  startsAt: Date;
  reminder24hSentAt: Date | null;
  clientConfirmedAt: Date | null;
}

// CA-19.5 and RF-18: the alert starts at the cancellation deadline (RN-09),
// the last moment the client can still reschedule or cancel through the bot.
export function isUnconfirmed(
  {
    status,
    startsAt,
    reminder24hSentAt,
    clientConfirmedAt,
  }: ClientConfirmationState,
  cancellationDeadlineMinutes: number,
  now: Date,
): boolean {
  if (status !== 'confirmed') return false;
  if (reminder24hSentAt === null || clientConfirmedAt !== null) return false;
  const alertFrom =
    startsAt.getTime() - cancellationDeadlineMinutes * MS_PER_MINUTE;
  return now.getTime() >= alertFrom;
}

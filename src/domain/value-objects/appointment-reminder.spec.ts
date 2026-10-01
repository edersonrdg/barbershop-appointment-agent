import type { AppointmentStatus } from '../entities/appointment';
import {
  ClientConfirmationState,
  isReminderDue,
  isUnconfirmed,
  ReminderKind,
} from './appointment-reminder';

const T = new Date('2026-09-30T14:00:00Z');
const LONG_AGO = new Date('2026-09-27T12:00:00Z');

const minutesBefore = (minutes: number): Date =>
  new Date(T.getTime() - minutes * 60 * 1000);

describe('US-19 appointment reminders', () => {
  describe('isReminderDue', () => {
    it.each<[ReminderKind, string, Date, Date, boolean]>([
      ['24h', 'now at T-24h', minutesBefore(24 * 60), LONG_AGO, true],
      ['24h', 'now at T-1h-1min', minutesBefore(61), LONG_AGO, true],
      ['24h', 'now at T-24h-1min', minutesBefore(24 * 60 + 1), LONG_AGO, false],
      ['24h', 'now at T-1h', minutesBefore(60), LONG_AGO, false],
      [
        '24h',
        'created at T-24h',
        minutesBefore(23 * 60),
        minutesBefore(24 * 60),
        true,
      ],
      [
        '24h',
        'created at T-24h+1min',
        minutesBefore(23 * 60),
        minutesBefore(24 * 60 - 1),
        false,
      ],
      ['1h', 'now at T-1h', minutesBefore(60), LONG_AGO, true],
      ['1h', 'now at T-1min', minutesBefore(1), LONG_AGO, true],
      ['1h', 'now at T-1h-1min', minutesBefore(61), LONG_AGO, false],
      ['1h', 'now at T', T, LONG_AGO, false],
      ['1h', 'created at T-1h', minutesBefore(30), minutesBefore(60), true],
      [
        '1h',
        'created at T-1h+1min',
        minutesBefore(30),
        minutesBefore(59),
        false,
      ],
    ])(
      'AC 1, AC 4, AC 7 (C1): %s reminder with %s is due: %s',
      (kind, _case, now, createdAt, due) => {
        expect(isReminderDue(kind, { startsAt: T, createdAt }, now)).toBe(due);
      },
    );
  });

  describe('isUnconfirmed', () => {
    const REMINDED: ClientConfirmationState = {
      status: 'confirmed',
      startsAt: T,
      reminder24hSentAt: new Date('2026-09-29T14:00:00Z'),
      clientConfirmedAt: null,
    };

    it.each<[string, Partial<ClientConfirmationState>, number, Date, boolean]>([
      ['deadline 120 at T-120min', {}, 120, minutesBefore(120), true],
      ['deadline 120 at T-121min', {}, 120, minutesBefore(121), false],
      ['deadline 30 at T-30min', {}, 30, minutesBefore(30), true],
      ['deadline 30 at T-31min', {}, 30, minutesBefore(31), false],
      [
        'confirmed by the client',
        { clientConfirmedAt: new Date('2026-09-29T15:00:00Z') },
        120,
        minutesBefore(60),
        false,
      ],
      [
        'without the 24h reminder',
        { reminder24hSentAt: null },
        120,
        minutesBefore(60),
        false,
      ],
      ...(['cancelled', 'attended', 'no_show'] as AppointmentStatus[]).map(
        (
          status,
        ): [
          string,
          Partial<ClientConfirmationState>,
          number,
          Date,
          boolean,
        ] => [`status ${status}`, { status }, 120, minutesBefore(60), false],
      ),
    ])(
      'CA-19.5, AC 21, AC 22 (C28): %s is unconfirmed: %s',
      (_case, override, deadline, now, expected) => {
        expect(isUnconfirmed({ ...REMINDED, ...override }, deadline, now)).toBe(
          expected,
        );
      },
    );
  });
});

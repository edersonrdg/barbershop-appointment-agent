import { DayOpeningHours } from './day-opening-hours';
import { DayWorkingHours } from './day-working-hours';
import { TimeOfDay } from './time-of-day';
import { Weekday, WEEKDAYS } from './weekday';
import { WeeklyOpeningHours } from './weekly-opening-hours';
import { WeeklyWorkingHours } from './weekly-working-hours';

const t = (raw: string) => TimeOfDay.create(raw);

interface Hours {
  from: string;
  to: string;
  break?: { from: string; to: string };
}

function opening(days: Partial<Record<Weekday, Hours>>): WeeklyOpeningHours {
  return WeeklyOpeningHours.create(
    Object.fromEntries(
      WEEKDAYS.map((weekday) => {
        const day = days[weekday];
        return [
          weekday,
          day
            ? DayOpeningHours.create({
                weekday,
                opensAt: t(day.from),
                closesAt: t(day.to),
                break: day.break
                  ? { startsAt: t(day.break.from), endsAt: t(day.break.to) }
                  : null,
              })
            : null,
        ];
      }),
    ) as Record<Weekday, DayOpeningHours | null>,
  );
}

function working(days: Partial<Record<Weekday, Hours>>): WeeklyWorkingHours {
  return WeeklyWorkingHours.create(
    Object.fromEntries(
      WEEKDAYS.map((weekday) => {
        const day = days[weekday];
        return [
          weekday,
          day
            ? DayWorkingHours.create({
                weekday,
                startsAt: t(day.from),
                endsAt: t(day.to),
                break: day.break
                  ? { startsAt: t(day.break.from), endsAt: t(day.break.to) }
                  : null,
              })
            : null,
        ];
      }),
    ) as Record<Weekday, DayWorkingHours | null>,
  );
}

const PARTIAL_MONDAY =
  'Segunda-feira: só o trecho da jornada dentro do horário de funcionamento estará disponível.';
const CLOSED_SUNDAY =
  'Domingo: a barbearia não abre neste dia, então a jornada não estará disponível.';

// Barbearia aberta 09:00-19:00 com intervalo 12:00-13:00 na segunda.
const MONDAY_OPEN = opening({
  monday: { from: '09:00', to: '19:00', break: { from: '12:00', to: '13:00' } },
});

describe('WeeklyWorkingHours', () => {
  it('CA-05.1: keeps each day as given and null on days off', () => {
    const hours = working({ tuesday: { from: '09:00', to: '18:00' } });

    expect(hours.forDay('tuesday')?.startsAt.toString()).toBe('09:00');
    expect(hours.forDay('tuesday')?.endsAt.toString()).toBe('18:00');
    expect(hours.forDay('monday')).toBeNull();
  });

  describe('CA-05.3: warnings against the opening hours', () => {
    it('warns that the day is unavailable when the barbershop is closed on it', () => {
      const hours = working({ sunday: { from: '09:00', to: '13:00' } });

      expect(hours.warningsAgainst(MONDAY_OPEN)).toEqual([
        { weekday: 'sunday', message: CLOSED_SUNDAY },
      ]);
    });

    it.each([
      ['starts before opening', { from: '08:59', to: '12:00' }],
      ['ends after closing', { from: '13:00', to: '19:01' }],
      ['works through the barbershop break', { from: '09:00', to: '19:00' }],
      ['starts inside the barbershop break', { from: '12:30', to: '19:00' }],
    ])(
      'warns that only the part inside the opening hours is available when it %s',
      (_case, monday) => {
        const hours = working({ monday });

        expect(hours.warningsAgainst(MONDAY_OPEN)).toEqual([
          { weekday: 'monday', message: PARTIAL_MONDAY },
        ]);
      },
    );

    it('warns when the barber break does not cover the barbershop break', () => {
      const hours = working({
        monday: {
          from: '09:00',
          to: '19:00',
          break: { from: '12:00', to: '12:30' },
        },
      });

      expect(hours.warningsAgainst(MONDAY_OPEN)).toEqual([
        { weekday: 'monday', message: PARTIAL_MONDAY },
      ]);
    });

    it.each([
      [
        'exactly the opening hours and break',
        {
          from: '09:00',
          to: '19:00',
          break: { from: '12:00', to: '13:00' },
        },
      ],
      [
        'a wider break than the barbershop',
        {
          from: '09:00',
          to: '19:00',
          break: { from: '11:00', to: '14:00' },
        },
      ],
      ['only the morning', { from: '09:00', to: '12:00' }],
      ['only the afternoon', { from: '13:00', to: '19:00' }],
    ])('returns no warning for %s', (_case, monday) => {
      expect(working({ monday }).warningsAgainst(MONDAY_OPEN)).toEqual([]);
    });

    it('returns no warning for a day off while the barbershop is open', () => {
      expect(working({}).warningsAgainst(MONDAY_OPEN)).toEqual([]);
    });

    it('returns one warning per day, in weekday order', () => {
      const hours = working({
        sunday: { from: '09:00', to: '13:00' },
        monday: { from: '08:00', to: '18:00' },
        tuesday: { from: '10:00', to: '11:00' },
      });

      expect(hours.warningsAgainst(MONDAY_OPEN)).toEqual([
        { weekday: 'monday', message: PARTIAL_MONDAY },
        {
          weekday: 'tuesday',
          message:
            'Terça-feira: a barbearia não abre neste dia, então a jornada não estará disponível.',
        },
        { weekday: 'sunday', message: CLOSED_SUNDAY },
      ]);
    });
  });
});

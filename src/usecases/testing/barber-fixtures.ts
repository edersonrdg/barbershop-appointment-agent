import { Barber } from '../../domain/entities/barber';
import { Barbershop } from '../../domain/entities/barbershop';
import { User, UserRole } from '../../domain/entities/user';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { DayOpeningHours } from '../../domain/value-objects/day-opening-hours';
import { TimeOfDay } from '../../domain/value-objects/time-of-day';
import { Weekday, WEEKDAYS } from '../../domain/value-objects/weekday';
import {
  WeeklyOpeningHours,
  WeeklyOpeningHoursDays,
} from '../../domain/value-objects/weekly-opening-hours';
import {
  toWeeklyWorkingHours,
  WorkingDayInput,
  WorkingHoursInput,
} from '../shared/to-weekly-working-hours';
import { InMemoryAccountStore } from './in-memory-account-store';
import { InMemoryBarberRepository } from './in-memory-barber.repository';

export const BARBER_CREATED_AT = new Date('2026-09-28T12:00:00.000Z');

export interface BarberState {
  id: string;
  barbershopId: string;
  name: string;
  active: boolean;
  userId: string | null;
  serviceIds: string[];
  workingHours: WorkingHoursInput;
}

export function day(
  startsAt: string,
  endsAt: string,
  workBreak: [string, string] | null = null,
): WorkingDayInput {
  return {
    startsAt,
    endsAt,
    break: workBreak ? { startsAt: workBreak[0], endsAt: workBreak[1] } : null,
  };
}

export function workingHoursInput(
  days: Partial<Record<Weekday, WorkingDayInput>> = {},
): WorkingHoursInput {
  return Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, days[weekday] ?? null]),
  ) as WorkingHoursInput;
}

export function describeBarber(barber: Barber): BarberState {
  return {
    id: barber.id,
    barbershopId: barber.barbershopId,
    name: barber.name,
    active: barber.active,
    userId: barber.userId,
    serviceIds: [...barber.serviceIds],
    workingHours: Object.fromEntries(
      WEEKDAYS.map((weekday) => {
        const workDay = barber.workingHours.forDay(weekday);
        if (!workDay) return [weekday, null];
        return [
          weekday,
          {
            startsAt: workDay.startsAt.toString(),
            endsAt: workDay.endsAt.toString(),
            break: workDay.break
              ? {
                  startsAt: workDay.break.startsAt.toString(),
                  endsAt: workDay.break.endsAt.toString(),
                }
              : null,
          },
        ];
      }),
    ) as WorkingHoursInput,
  };
}

export async function seedBarber(
  repository: InMemoryBarberRepository,
  state: Partial<BarberState> & Pick<BarberState, 'id' | 'name'>,
): Promise<Barber> {
  const barber = Barber.restore({
    id: state.id,
    barbershopId: state.barbershopId ?? 'barbershop-a',
    name: state.name,
    active: state.active ?? true,
    userId: state.userId ?? null,
    serviceIds: state.serviceIds ?? ['haircut'],
    workingHours: toWeeklyWorkingHours(
      state.workingHours ??
        workingHoursInput({ monday: day('09:00', '18:00') }),
    ),
    createdAt: BARBER_CREATED_AT,
  });
  await repository.create(barber);
  return barber;
}

export function seedUser(
  store: InMemoryAccountStore,
  id: string,
  role: UserRole,
  barbershopId = 'barbershop-a',
): User {
  const user = User.restore({
    id,
    barbershopId,
    name: 'Usuário',
    email: `${id}@example.com`,
    phone: null,
    passwordHash: 'hash',
    role,
    createdAt: BARBER_CREATED_AT,
  });
  store.users.push(user);
  return user;
}

// Opening hours by weekday as [opensAt, closesAt, break?]; missing days close.
export function seedBarbershop(
  store: InMemoryAccountStore,
  id: string,
  hours: Partial<
    Record<Weekday, [string, string] | [string, string, [string, string]]>
  > = {},
): Barbershop {
  const days = Object.fromEntries(
    WEEKDAYS.map((weekday) => {
      const hoursOfDay = hours[weekday];
      if (!hoursOfDay) return [weekday, null];
      const [opensAt, closesAt, openingBreak] = hoursOfDay;
      return [
        weekday,
        DayOpeningHours.create({
          weekday,
          opensAt: TimeOfDay.create(opensAt),
          closesAt: TimeOfDay.create(closesAt),
          break: openingBreak
            ? {
                startsAt: TimeOfDay.create(openingBreak[0]),
                endsAt: TimeOfDay.create(openingBreak[1]),
              }
            : null,
        }),
      ];
    }),
  ) as WeeklyOpeningHoursDays;
  const barbershop = Barbershop.restore({
    id,
    name: 'Barbearia',
    address: 'Rua das Flores, 123',
    timezone: BarbershopTimezone.create('America/Sao_Paulo'),
    openingHours: WeeklyOpeningHours.create(days),
    subscriptionStatus: 'trialing',
    trialEndsAt: BARBER_CREATED_AT,
    createdAt: BARBER_CREATED_AT,
  });
  store.barbershops.push(barbershop);
  return barbershop;
}

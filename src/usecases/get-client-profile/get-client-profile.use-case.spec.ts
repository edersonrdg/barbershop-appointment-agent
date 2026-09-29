import { AppointmentStatus } from '../../domain/entities/appointment';
import { Client } from '../../domain/entities/client';
import { ClientNotFoundError } from '../../domain/errors/client-not-found.error';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { ScheduleEntry } from '../ports/schedule.query.port';
import { seedBarber } from '../testing/barber-fixtures';
import { InMemoryClientRepository } from '../testing/in-memory-client.repository';
import { InMemoryNoShowLedger } from '../testing/in-memory-no-show-ledger';
import { InMemoryScheduleQuery } from '../testing/in-memory-schedule.query';
import { at, setupScheduling } from '../testing/scheduling-fixtures';
import {
  GetClientProfileInput,
  GetClientProfileUseCase,
} from './get-client-profile.use-case';

const NOW = at('10:00');
const SHOP = 'barbershop-a';
const HAIRCUT = { id: 'haircut', name: 'Corte' };
const BEARD = { id: 'beard', name: 'Barba' };
const BROWS = { id: 'brows', name: 'Sobrancelha' };
const HYDRATION = { id: 'hydration', name: 'Hidratação' };
const PIGMENT = { id: 'pigment', name: 'Pigmentação' };

// Barbearia A: Ana (user-ana) e Bruno (user-bruno); João é cliente da A.
// Agora é segunda 2026-10-05 às 10:00 em São Paulo.
async function setup() {
  const env = await setupScheduling(NOW);
  await seedBarber(env.barbers, { id: 'ana', name: 'Ana', userId: 'user-ana' });
  await seedBarber(env.barbers, {
    id: 'bruno',
    name: 'Bruno',
    userId: 'user-bruno',
  });
  const clients = new InMemoryClientRepository();
  clients.add(
    Client.create({
      id: 'joao',
      barbershopId: SHOP,
      name: 'João',
      phone: PhoneNumber.create('11987654321'),
      now: at('09:00', '2026-09-01'),
    }),
  );
  const schedule = new InMemoryScheduleQuery();
  const useCase = new GetClientProfileUseCase(
    env.barbershops,
    env.barbers,
    clients,
    schedule,
    new InMemoryNoShowLedger(env.appointments),
    env.bookingRules,
    env.clock,
  );

  const seed = (
    id: string,
    startsAt: Date,
    {
      status = 'confirmed',
      barber = 'ana',
      services = [HAIRCUT],
    }: {
      status?: AppointmentStatus;
      barber?: string;
      services?: ScheduleEntry['services'];
    } = {},
  ) =>
    schedule.seed(SHOP, {
      id,
      startsAt,
      barber: { id: barber, name: barber },
      client: { id: 'joao', name: 'João', phone: '+5511987654321' },
      services,
      status,
    });

  const profile = (input: Partial<GetClientProfileInput> = {}) =>
    useCase.execute({
      barbershopId: SHOP,
      userId: 'owner',
      role: 'owner',
      clientId: 'joao',
      ...input,
    });

  return { seed, profile };
}

const ids = (entries: ScheduleEntry[]) => entries.map((entry) => entry.id);

describe('GetClientProfileUseCase', () => {
  it('CA-12.2 (C10): past appointments start at or before now, in any status, most recent first', async () => {
    const { seed, profile } = await setup();
    seed('attended-old', at('10:00', '2026-09-01'), { status: 'attended' });
    seed('no-show', at('10:00', '2026-09-15'), { status: 'no_show' });
    seed('unmarked', at('09:00'), { status: 'confirmed' });
    seed('starting-now', NOW);
    seed('later-today', at('10:30'));

    const result = await profile();

    expect(ids(result.pastAppointments)).toEqual([
      'starting-now',
      'unmarked',
      'no-show',
      'attended-old',
    ]);
  });

  it('CA-12.2 (C11): upcoming appointments start after now, the nearest first', async () => {
    const { seed, profile } = await setup();
    seed('next-week', at('10:00', '2026-10-12'));
    seed('starting-now', NOW);
    seed('later-today', at('10:30'));
    seed('tomorrow', at('09:00', '2026-10-06'));

    const result = await profile();

    expect(ids(result.upcomingAppointments)).toEqual([
      'later-today',
      'tomorrow',
      'next-week',
    ]);
  });

  it('CA-12.2 (C12): top services count only attended appointments, at most 3, by count then name', async () => {
    const { seed, profile } = await setup();
    const past = (day: number) =>
      at('10:00', `2026-09-${String(day).padStart(2, '0')}`);
    seed('a1', past(1), { status: 'attended', services: [HAIRCUT, BEARD] });
    seed('a2', past(2), { status: 'attended', services: [HAIRCUT, BROWS] });
    seed('a3', past(3), { status: 'attended', services: [HAIRCUT] });
    seed('a4', past(4), { status: 'attended', services: [BEARD, BROWS] });
    seed('a5', past(5), { status: 'attended', services: [HYDRATION] });
    for (const day of [6, 7, 8]) {
      seed(`n${day}`, past(day), { status: 'no_show', services: [PIGMENT] });
    }
    seed('unmarked', past(9), { services: [PIGMENT] });
    seed('future', at('10:00', '2026-10-12'), { services: [PIGMENT] });

    const result = await profile();

    expect(result.topServices).toEqual([
      { id: 'haircut', name: 'Corte', count: 3 },
      { id: 'beard', name: 'Barba', count: 2 },
      { id: 'brows', name: 'Sobrancelha', count: 2 },
    ]);
  });

  it('CA-12.2: a client without appointments has empty lists, no no-shows and is not blocked', async () => {
    const { profile } = await setup();

    const result = await profile();

    expect(result).toMatchObject({
      pastAppointments: [],
      upcomingAppointments: [],
      topServices: [],
      noShowCount: 0,
      selfBookingBlocked: false,
      timezone: 'America/Sao_Paulo',
    });
    expect(result.client.returnReminderEnabled).toBe(false);
  });

  it('CA-12.3: a barber only sees the appointments of their own barber', async () => {
    const { seed, profile } = await setup();
    seed('with-ana', at('09:00'), { status: 'attended', barber: 'ana' });
    seed('with-bruno', at('09:30'), {
      status: 'attended',
      barber: 'bruno',
      services: [BEARD],
    });
    seed('next-with-ana', at('11:00'), { barber: 'ana' });

    const result = await profile({ userId: 'user-bruno', role: 'barber' });

    expect(ids(result.pastAppointments)).toEqual(['with-bruno']);
    expect(result.upcomingAppointments).toEqual([]);
    expect(result.topServices).toEqual([
      { id: 'beard', name: 'Barba', count: 1 },
    ]);
  });

  it('CA-12.3: a barber without an appointment with the client gets ClientNotFoundError', async () => {
    const { seed, profile } = await setup();
    seed('with-ana', at('09:00'), { barber: 'ana' });

    await expect(
      profile({ userId: 'user-bruno', role: 'barber' }),
    ).rejects.toThrow(ClientNotFoundError);
  });

  it('CA-12.3: a barber user without a barber record gets ClientNotFoundError', async () => {
    const { seed, profile } = await setup();
    seed('with-ana', at('09:00'), { barber: 'ana' });

    await expect(
      profile({ userId: 'user-caio', role: 'barber' }),
    ).rejects.toThrow(ClientNotFoundError);
  });

  it('RN-26: a client of another barbershop is not found', async () => {
    const { profile } = await setup();

    await expect(profile({ barbershopId: 'barbershop-b' })).rejects.toThrow(
      new ClientNotFoundError(),
    );
  });
});

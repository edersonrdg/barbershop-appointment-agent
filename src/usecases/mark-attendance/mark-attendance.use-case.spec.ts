import {
  Appointment,
  AppointmentStatus,
} from '../../domain/entities/appointment';
import { AppointmentCancelledError } from '../../domain/errors/appointment-cancelled.error';
import { AppointmentNotFoundError } from '../../domain/errors/appointment-not-found.error';
import { AppointmentNotStartedError } from '../../domain/errors/appointment-not-started.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { ScheduleEntry } from '../ports/schedule.query.port';
import { BarberAccessPolicy } from '../shared/barber-access-policy';
import { seedBarber } from '../testing/barber-fixtures';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAppointmentRepository } from '../testing/in-memory-appointment.repository';
import { InMemoryNoShowLedger } from '../testing/in-memory-no-show-ledger';
import { InMemoryScheduleQuery } from '../testing/in-memory-schedule.query';
import { at, setupScheduling } from '../testing/scheduling-fixtures';
import {
  MarkAttendanceInput,
  MarkAttendanceUseCase,
} from './mark-attendance.use-case';

const NOW = at('10:05');
const LAST_MONDAY = '2026-09-28';
const TWO_MONDAYS_AGO = '2026-09-21';

// Reads the entry back from the stored appointments, as the schedule does from
// the database.
class StoredScheduleQuery extends InMemoryScheduleQuery {
  constructor(private readonly appointments: InMemoryAppointmentRepository) {
    super();
  }

  override async findById(
    barbershopId: string,
    appointmentId: string,
  ): Promise<ScheduleEntry | null> {
    const appointment = await this.appointments.findById(
      barbershopId,
      appointmentId,
    );
    if (!appointment) return null;
    return {
      id: appointment.id,
      barber: { id: appointment.barberId, name: appointment.barberId },
      client: appointment.clientId
        ? { id: appointment.clientId, name: 'Maria', phone: '+5511900000000' }
        : null,
      services: [{ id: 'haircut', name: 'Corte' }],
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      origin: appointment.origin,
    };
  }
}

function rulesWithNoShowLimit(noShowLimit: number): BookingRules {
  const defaults = BookingRules.defaults();
  return BookingRules.create({
    minimumAdvanceMinutes: defaults.minimumAdvanceMinutes,
    cancellationDeadlineMinutes: defaults.cancellationDeadlineMinutes,
    noShowLimit,
    waitlistOfferMinutes: defaults.waitlistOfferMinutes,
    returnReminderDays: defaults.returnReminderDays,
  });
}

// Barbearia A (limite de faltas 2). Ana (user-ana) e Bruno (user-bruno) são
// barbeiros da A. A cliente Maria tem o agendamento "today" com Ana às 10:00
// de segunda; agora são 10:05.
async function setup(now = NOW) {
  const env = await setupScheduling(now);
  const appointments = new InMemoryAppointmentRepository();
  const ledger = new InMemoryNoShowLedger(appointments);
  await seedBarber(env.barbers, { id: 'ana', name: 'Ana', userId: 'user-ana' });
  await seedBarber(env.barbers, {
    id: 'bruno',
    name: 'Bruno',
    userId: 'user-bruno',
  });
  env.store.bookingRules.set('barbershop-a', rulesWithNoShowLimit(2));

  const seed = async ({
    id,
    startsAt,
    status = 'confirmed',
    clientId = 'maria',
    barberId = 'ana',
    barbershopId = 'barbershop-a',
  }: {
    id: string;
    startsAt: Date;
    status?: AppointmentStatus;
    clientId?: string | null;
    barberId?: string;
    barbershopId?: string;
  }): Promise<void> => {
    await appointments.create(
      Appointment.restore({
        id,
        barbershopId,
        barberId,
        clientId,
        serviceIds: ['haircut'],
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
        status,
        origin: 'manual',
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
      }),
    );
  };
  await seed({ id: 'today', startsAt: at('10:00') });

  const useCase = new MarkAttendanceUseCase(
    appointments,
    new BarberAccessPolicy(env.barbers),
    ledger,
    env.bookingRules,
    new StoredScheduleQuery(appointments),
    new FixedClock(now),
  );
  const mark = (input: Partial<MarkAttendanceInput> = {}) =>
    useCase.execute({
      barbershopId: 'barbershop-a',
      userId: 'owner-a',
      role: 'owner',
      appointmentId: 'today',
      status: 'attended',
      ...input,
    });
  const statusOf = async (id: string, barbershopId = 'barbershop-a') =>
    (await appointments.findById(barbershopId, id))?.status;
  const noShowsOfMaria = () => ledger.countFor('barbershop-a', 'maria');
  return { env, ledger, seed, mark, statusOf, noShowsOfMaria };
}

describe('MarkAttendanceUseCase', () => {
  it('CA-11.1: marks a started appointment as attended and returns it with the client summary (ATD-01)', async () => {
    const { mark, statusOf } = await setup();

    const result = await mark({ status: 'attended' });

    expect(result.appointment).toMatchObject({
      id: 'today',
      status: 'attended',
      startsAt: at('10:00'),
    });
    expect(result.client).toEqual({
      id: 'maria',
      noShowCount: 0,
      selfBookingBlocked: false,
    });
    expect(await statusOf('today')).toBe('attended');
  });

  it('CA-11.1: marks a started appointment as a no-show (ATD-01)', async () => {
    const { mark, statusOf } = await setup();

    const result = await mark({ status: 'no_show' });

    expect(result.appointment.status).toBe('no_show');
    expect(await statusOf('today')).toBe('no_show');
  });

  it('CA-11.1: accepts the mark exactly at the start of the appointment', async () => {
    const { mark, statusOf } = await setup(at('10:00'));

    const result = await mark({ status: 'no_show' });

    expect(result.appointment.status).toBe('no_show');
    expect(await statusOf('today')).toBe('no_show');
  });

  it('CA-11.1: refuses the mark before the appointment starts, changing neither status nor counter (ATD-02)', async () => {
    const { seed, mark, statusOf, noShowsOfMaria } = await setup(
      new Date(at('10:00').getTime() - 1),
    );
    await seed({
      id: 'past',
      startsAt: at('10:00', LAST_MONDAY),
      status: 'no_show',
    });

    const attempt = mark({ status: 'no_show' });

    await expect(attempt).rejects.toThrow(AppointmentNotStartedError);
    await expect(attempt).rejects.toThrow('O agendamento ainda não começou.');
    expect(await statusOf('today')).toBe('confirmed');
    expect(await noShowsOfMaria()).toBe(1);
  });

  it('CA-11.1: marking the status the appointment already has keeps the counter (ATD-05)', async () => {
    const { mark, statusOf } = await setup();
    await mark({ status: 'no_show' });

    const result = await mark({ status: 'no_show' });

    expect(result.appointment.status).toBe('no_show');
    expect(result.client).toEqual({
      id: 'maria',
      noShowCount: 1,
      selfBookingBlocked: false,
    });
    expect(await statusOf('today')).toBe('no_show');
  });

  it('CA-11.1: an appointment without a client is marked and returns client null (ATD-06)', async () => {
    const { seed, mark, statusOf } = await setup();
    await seed({ id: 'walk-in', startsAt: at('09:00'), clientId: null });

    const result = await mark({ appointmentId: 'walk-in', status: 'no_show' });

    expect(result.client).toBeNull();
    expect(result.appointment.status).toBe('no_show');
    expect(await statusOf('walk-in')).toBe('no_show');
  });

  it('CA-11.2: a no-show adds 1 to the counter of the client (ATD-07)', async () => {
    const { mark, noShowsOfMaria } = await setup();

    const result = await mark({ status: 'no_show' });

    expect(result.client?.noShowCount).toBe(1);
    expect(await noShowsOfMaria()).toBe(1);
  });

  it('CA-11.2: with 1 no-show and limit 2, a new no-show blocks self-booking (ATD-08, ATD-09)', async () => {
    const { seed, mark } = await setup();
    await seed({
      id: 'past',
      startsAt: at('10:00', LAST_MONDAY),
      status: 'no_show',
    });

    const result = await mark({ status: 'no_show' });

    expect(result.client).toEqual({
      id: 'maria',
      noShowCount: 2,
      selfBookingBlocked: true,
    });
  });

  it('CA-11.2: the block follows the limit in force, so raising it to 3 unblocks the client (ATD-10)', async () => {
    const { env, seed, mark } = await setup();
    await seed({
      id: 'past',
      startsAt: at('10:00', LAST_MONDAY),
      status: 'no_show',
    });
    await mark({ status: 'no_show' });
    env.store.bookingRules.set('barbershop-a', rulesWithNoShowLimit(3));

    const result = await mark({ status: 'no_show' });

    expect(result.client).toEqual({
      id: 'maria',
      noShowCount: 2,
      selfBookingBlocked: false,
    });
  });

  it('CA-11.2: with limit 1 the first no-show blocks the client (RN-12)', async () => {
    const { env, mark } = await setup();
    env.store.bookingRules.set('barbershop-a', rulesWithNoShowLimit(1));

    const result = await mark({ status: 'no_show' });

    expect(result.client).toEqual({
      id: 'maria',
      noShowCount: 1,
      selfBookingBlocked: true,
    });
  });

  it('RN-26: no-shows of another barbershop do not count (ATD-12)', async () => {
    const { seed, mark } = await setup();
    await seed({
      id: 'foreign',
      startsAt: at('10:00', LAST_MONDAY),
      status: 'no_show',
      barbershopId: 'barbershop-b',
      barberId: 'zeca',
    });

    const result = await mark({ status: 'no_show' });

    expect(result.client?.noShowCount).toBe(1);
  });

  it('CA-11.4: correcting a no-show to attended with 2 no-shows and limit 2 unblocks the client (ATD-13)', async () => {
    const { seed, mark, statusOf } = await setup();
    await seed({
      id: 'past',
      startsAt: at('10:00', LAST_MONDAY),
      status: 'no_show',
    });
    await mark({ status: 'no_show' });

    const result = await mark({ status: 'attended' });

    expect(result.client).toEqual({
      id: 'maria',
      noShowCount: 1,
      selfBookingBlocked: false,
    });
    expect(await statusOf('today')).toBe('attended');
  });

  it('CA-11.4: correcting attended to no-show adds 1 to the counter (ATD-14)', async () => {
    const { mark, noShowsOfMaria } = await setup();
    await mark({ status: 'attended' });

    const result = await mark({ status: 'no_show' });

    expect(result.appointment.status).toBe('no_show');
    expect(result.client?.noShowCount).toBe(1);
    expect(await noShowsOfMaria()).toBe(1);
  });

  it('RN-13: marking or correcting an appointment that started before the last reset keeps the counter (ATD-15)', async () => {
    const { ledger, seed, mark, statusOf } = await setup();
    await seed({ id: 'old', startsAt: at('10:00', TWO_MONDAYS_AGO) });
    await seed({
      id: 'recent',
      startsAt: at('10:00', LAST_MONDAY),
      status: 'no_show',
    });
    ledger.setResetAt('barbershop-a', 'maria', at('12:00', TWO_MONDAYS_AGO));

    const marked = await mark({ appointmentId: 'old', status: 'no_show' });
    const corrected = await mark({ appointmentId: 'old', status: 'attended' });

    expect(marked.client?.noShowCount).toBe(1);
    expect(corrected.client?.noShowCount).toBe(1);
    expect(await statusOf('old')).toBe('attended');
  });

  it('RN-13: marking and correcting an appointment that started after the last reset changes the counter normally', async () => {
    const { ledger, seed, mark } = await setup();
    await seed({
      id: 'recent',
      startsAt: at('10:00', LAST_MONDAY),
      status: 'no_show',
    });
    ledger.setResetAt('barbershop-a', 'maria', at('12:00', TWO_MONDAYS_AGO));

    const marked = await mark({ status: 'no_show' });
    const corrected = await mark({ status: 'attended' });

    expect(marked.client?.noShowCount).toBe(2);
    expect(corrected.client?.noShowCount).toBe(1);
  });

  it('CA-11.4: two concurrent marks end with one of the sent statuses and a matching counter (ATD-16)', async () => {
    const { mark, statusOf, noShowsOfMaria } = await setup();

    await Promise.all([
      mark({ status: 'no_show' }),
      mark({ status: 'attended' }),
    ]);

    const final = await statusOf('today');
    expect(['attended', 'no_show']).toContain(final);
    expect(await noShowsOfMaria()).toBe(final === 'no_show' ? 1 : 0);
  });

  it('RN-26: an appointment that does not exist in the barbershop of the session is not found and nothing changes (ATD-18)', async () => {
    const { seed, mark, statusOf } = await setup();
    await seed({
      id: 'foreign',
      startsAt: at('10:00'),
      barbershopId: 'barbershop-b',
      barberId: 'zeca',
    });

    const foreign = mark({ appointmentId: 'foreign', status: 'no_show' });
    const unknown = mark({ appointmentId: 'unknown', status: 'no_show' });

    await expect(foreign).rejects.toThrow(AppointmentNotFoundError);
    await expect(foreign).rejects.toThrow('Agendamento não encontrado.');
    await expect(unknown).rejects.toThrow('Agendamento não encontrado.');
    expect(await statusOf('foreign', 'barbershop-b')).toBe('confirmed');
  });

  it('Seção 5: a barber marks an appointment of the barber linked to them (ATD-19)', async () => {
    const { mark, statusOf } = await setup();

    const result = await mark({
      userId: 'user-ana',
      role: 'barber',
      status: 'no_show',
    });

    expect(result.appointment.status).toBe('no_show');
    expect(await statusOf('today')).toBe('no_show');
  });

  it('Seção 5: a barber cannot mark an appointment of another barber, and nothing changes (ATD-20)', async () => {
    const { mark, statusOf, noShowsOfMaria } = await setup();

    const attempt = mark({
      userId: 'user-bruno',
      role: 'barber',
      status: 'no_show',
    });

    await expect(attempt).rejects.toThrow(ScheduleAccessDeniedError);
    await expect(attempt).rejects.toThrow('Acesso negado.');
    expect(await statusOf('today')).toBe('confirmed');
    expect(await noShowsOfMaria()).toBe(0);
  });

  it('Seção 5: a barber user without a barber record cannot mark, and nothing changes (ATD-20)', async () => {
    const { mark, statusOf, noShowsOfMaria } = await setup();

    const attempt = mark({
      userId: 'user-without-barber',
      role: 'barber',
      status: 'no_show',
    });

    await expect(attempt).rejects.toThrow('Acesso negado.');
    expect(await statusOf('today')).toBe('confirmed');
    expect(await noShowsOfMaria()).toBe(0);
  });

  describe('US-18 cancelled appointments', () => {
    it('AC 24 (C29): marking attendance on a cancelled appointment is refused and changes nothing', async () => {
      const { seed, mark, statusOf } = await setup();
      await seed({
        id: 'cancelled',
        startsAt: at('09:00'),
        status: 'cancelled',
      });

      const attempt = mark({ appointmentId: 'cancelled', status: 'attended' });

      await expect(attempt).rejects.toThrow(AppointmentCancelledError);
      await expect(attempt).rejects.toThrow('Esse agendamento foi cancelado.');
      expect(await statusOf('cancelled')).toBe('cancelled');
    });
  });
});

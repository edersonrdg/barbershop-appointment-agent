import {
  Appointment,
  AppointmentOrigin,
} from '../../domain/entities/appointment';
import { Client } from '../../domain/entities/client';
import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { BarberUnavailableError } from '../../domain/errors/barber-unavailable.error';
import { DomainError } from '../../domain/errors/domain.error';
import { InvalidValueError } from '../../domain/errors/invalid-value.error';
import { MinimumAdvanceNotMetError } from '../../domain/errors/minimum-advance-not-met.error';
import { OutsideOpeningHoursError } from '../../domain/errors/outside-opening-hours.error';
import { OutsideWorkingHoursError } from '../../domain/errors/outside-working-hours.error';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { ServiceNotPerformedError } from '../../domain/errors/service-not-performed.error';
import { SlotInPastError } from '../../domain/errors/slot-in-past.error';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { ListAvailableSlotsUseCase } from '../list-available-slots/list-available-slots.use-case';
import {
  AppointmentRepository,
  BusyPeriod,
} from '../ports/appointment.repository.port';
import { day, seedBarber, workingHoursInput } from '../testing/barber-fixtures';
import { CountingAppointmentMetrics } from '../testing/counting-appointment-metrics';
import { InMemoryAppointmentRepository } from '../testing/in-memory-appointment.repository';
import { InMemoryClientRepository } from '../testing/in-memory-client.repository';
import {
  at,
  MONDAY,
  rulesWithMinimumAdvance,
  setupScheduling,
} from '../testing/scheduling-fixtures';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import {
  BookAppointmentInput,
  BookAppointmentUseCase,
} from './book-appointment.use-case';

// Sunday before MONDAY: nothing on MONDAY is in the past nor inside the advance.
const SUNDAY_NOON = new Date('2026-10-04T12:00:00.000Z');

// Barbearia A abre 09:00-18:00 com intervalo 12:00-13:00 na segunda e exige
// 60 min de antecedência. Ana trabalha 10:00-17:00, faz corte (30) e barba
// (15), tem um agendamento 14:00-14:45 e um bloqueio 15:30-16:00.
async function setup(
  now = SUNDAY_NOON,
  appointmentsOverride?: (
    real: InMemoryAppointmentRepository,
  ) => AppointmentRepository,
) {
  const env = await setupScheduling(now);
  await seedBarber(env.barbers, {
    id: 'ana',
    name: 'Ana',
    serviceIds: ['haircut', 'beard'],
    workingHours: workingHoursInput({ monday: day('10:00', '17:00') }),
  });
  await seedBarber(env.barbers, { id: 'bia', name: 'Bia', active: false });
  await seedBarber(env.barbers, {
    id: 'zeca',
    name: 'Zeca',
    barbershopId: 'barbershop-b',
    serviceIds: ['foreign'],
  });
  env.appointments.seed({
    barbershopId: 'barbershop-a',
    barberId: 'ana',
    start: at('14:00'),
    end: at('14:45'),
  });
  env.blocks.seed({
    barbershopId: 'barbershop-a',
    barberId: 'ana',
    start: at('15:30'),
    end: at('16:00'),
  });
  const metrics = new CountingAppointmentMetrics();
  const appointments = appointmentsOverride
    ? appointmentsOverride(env.appointments)
    : env.appointments;
  const useCase = new BookAppointmentUseCase(
    env.barbershops,
    env.bookingRules,
    env.barbers,
    env.services,
    appointments,
    env.blocks,
    env.clock,
    new SequentialIdGenerator(),
    metrics,
  );
  const listSlots = new ListAvailableSlotsUseCase(
    env.barbershops,
    env.bookingRules,
    env.barbers,
    env.services,
    appointments,
    env.blocks,
    env.clock,
  );
  return { ...env, metrics, useCase, listSlots };
}

function input(
  overrides: Partial<BookAppointmentInput> = {},
): BookAppointmentInput {
  return {
    barbershopId: 'barbershop-a',
    barberId: 'ana',
    serviceIds: ['beard', 'haircut'],
    startsAt: at('10:00'),
    origin: 'manual',
    ...overrides,
  };
}

function describeAppointment(appointment: Appointment) {
  return {
    id: appointment.id,
    barbershopId: appointment.barbershopId,
    barberId: appointment.barberId,
    serviceIds: [...appointment.serviceIds],
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    status: appointment.status,
    origin: appointment.origin,
  };
}

async function stored(
  appointments: InMemoryAppointmentRepository,
): Promise<ReturnType<typeof describeAppointment>[]> {
  return (await appointments.list('barbershop-a')).map(describeAppointment);
}

async function expectRefusal(
  attempt: Promise<unknown>,
  errorType: new (...args: never[]) => DomainError,
  message: string,
  rule: string | undefined,
): Promise<void> {
  await expect(attempt).rejects.toBeInstanceOf(errorType);
  await expect(attempt).rejects.toThrow(message);
  await expect(attempt).rejects.toHaveProperty('rule', rule);
}

const SEEDED = {
  id: 'seeded-1',
  barbershopId: 'barbershop-a',
  barberId: 'ana',
  serviceIds: ['haircut'],
  startsAt: at('14:00'),
  endsAt: at('14:45'),
  status: 'confirmed',
  origin: 'manual',
};

describe('BookAppointmentUseCase', () => {
  describe('CA-07.5: booking that respects every rule', () => {
    it.each<AppointmentOrigin>(['manual', 'bot'])(
      'CA-07.5: persists and returns a confirmed %s appointment with barber, services in order, start and end (AVL-18, AVL-02)',
      async (origin) => {
        const { useCase, appointments } = await setup();

        const appointment = await useCase.execute(input({ origin }));

        const expected = {
          id: 'id-1',
          barbershopId: 'barbershop-a',
          barberId: 'ana',
          serviceIds: ['beard', 'haircut'],
          startsAt: at('10:00'),
          endsAt: at('10:45'),
          status: 'confirmed',
          origin,
        };
        expect(describeAppointment(appointment)).toEqual(expected);
        expect(await stored(appointments)).toEqual([SEEDED, expected]);
      },
    );

    it('CA-07.3: the panel (manual) accepts a start inside the minimum advance', async () => {
      const { useCase, appointments } = await setup(at('10:05'));

      const appointment = await useCase.execute(
        input({ origin: 'manual', startsAt: at('10:30') }),
      );

      expect(appointment.startsAt).toEqual(at('10:30'));
      expect(await stored(appointments)).toHaveLength(2);
    });

    it('CA-07.3: a changed minimum advance applies to the next booking (AVL-17)', async () => {
      const { useCase, appointments, bookingRules } = await setup(at('10:05'));

      await bookingRules.save('barbershop-a', rulesWithMinimumAdvance(120));
      await expectRefusal(
        useCase.execute(input({ origin: 'bot', startsAt: at('11:30') })),
        MinimumAdvanceNotMetError,
        'Escolha um horário com pelo menos 120 minutos de antecedência.',
        'RN-02',
      );
      expect(await stored(appointments)).toEqual([SEEDED]);

      await bookingRules.save('barbershop-a', rulesWithMinimumAdvance(30));
      const appointment = await useCase.execute(
        input({ origin: 'bot', startsAt: at('10:45') }),
      );
      expect(appointment.startsAt).toEqual(at('10:45'));
    });

    it('CA-07.3: a barbershop without saved rules books with the default minimum advance', async () => {
      const { useCase, appointments, store } = await setup(at('10:05'));
      store.bookingRules.delete('barbershop-a');

      await expectRefusal(
        useCase.execute(input({ origin: 'bot', startsAt: at('11:00') })),
        MinimumAdvanceNotMetError,
        'Escolha um horário com pelo menos 60 minutos de antecedência.',
        'RN-02',
      );
      expect(await stored(appointments)).toEqual([SEEDED]);
    });

    it('CA-07.5: accepts a start off the 30-minute grid, right after an appointment', async () => {
      const { useCase } = await setup();

      const appointment = await useCase.execute(
        input({ startsAt: at('14:45') }),
      );

      expect(appointment.endsAt).toEqual(at('15:30'));
    });

    it.each<AppointmentOrigin>(['bot', 'manual'])(
      'CA-07.1 · CA-07.5: every slot returned to %s is accepted with the same now (AVL-27)',
      async (origin) => {
        const now = at('10:05');
        const { listSlots } = await setup(now);
        const slots = await listSlots.execute({
          barbershopId: 'barbershop-a',
          barberId: 'ana',
          serviceIds: ['beard', 'haircut'],
          date: MONDAY,
          origin,
        });

        expect(slots.length).toBeGreaterThan(0);
        for (const slot of slots) {
          const { useCase } = await setup(now);
          const appointment = await useCase.execute(
            input({ origin, startsAt: slot.startsAt }),
          );
          expect([appointment.startsAt, appointment.endsAt]).toEqual([
            slot.startsAt,
            slot.endsAt,
          ]);
        }
      },
    );
  });

  describe('CA-07.5: refusals name the rule and persist nothing (AVL-19 to AVL-26)', () => {
    it.each<
      [
        string,
        Partial<BookAppointmentInput>,
        Date,
        new (...args: never[]) => DomainError,
        string,
        string | undefined,
      ]
    >([
      [
        'AVL-19: bot inside the minimum advance',
        { origin: 'bot', startsAt: at('11:00') },
        at('10:05'),
        MinimumAdvanceNotMetError,
        'Escolha um horário com pelo menos 60 minutos de antecedência.',
        'RN-02',
      ],
      [
        'AVL-20: start in the past',
        { origin: 'manual', startsAt: at('10:00') },
        at('10:05'),
        SlotInPastError,
        'O horário já passou.',
        undefined,
      ],
      [
        'AVL-21: interval crossing the opening break',
        { startsAt: at('11:30') },
        SUNDAY_NOON,
        OutsideOpeningHoursError,
        'O horário está fora do funcionamento da barbearia.',
        'RN-05',
      ],
      [
        'AVL-22: interval before the working day',
        { startsAt: at('09:00') },
        SUNDAY_NOON,
        OutsideWorkingHoursError,
        'O horário está fora da jornada do barbeiro.',
        'RN-05',
      ],
      [
        'AVL-23: interval overlapping a block',
        { startsAt: at('15:00') },
        SUNDAY_NOON,
        BarberUnavailableError,
        'O barbeiro está indisponível nesse horário.',
        'RN-05',
      ],
      [
        'AVL-24: interval overlapping a confirmed appointment',
        { startsAt: at('13:30') },
        SUNDAY_NOON,
        AppointmentConflictError,
        'O barbeiro já tem um agendamento nesse horário.',
        'RN-03',
      ],
    ])('CA-07.5: %s', async (_, overrides, now, errorType, message, rule) => {
      const { useCase, appointments } = await setup(now);

      await expectRefusal(
        useCase.execute(input(overrides)),
        errorType,
        message,
        rule,
      );
      expect(await stored(appointments)).toEqual([SEEDED]);
    });

    it.each<
      [
        string,
        Partial<BookAppointmentInput>,
        Date,
        new (...args: never[]) => DomainError,
      ]
    >([
      [
        'unknown barber and past start: barber first',
        { barberId: 'ghost', origin: 'bot', startsAt: at('10:00') },
        at('10:05'),
        BarberNotFoundError,
      ],
      [
        'past start inside the advance (bot): past first',
        { origin: 'bot', startsAt: at('10:00') },
        at('10:05'),
        SlotInPastError,
      ],
      [
        'inside the advance and crossing the break (bot): advance first',
        { origin: 'bot', startsAt: at('11:30') },
        at('11:00'),
        MinimumAdvanceNotMetError,
      ],
      [
        'before opening and before the working day: opening first',
        { startsAt: at('08:30') },
        SUNDAY_NOON,
        OutsideOpeningHoursError,
      ],
      [
        'before the working day and overlapping a block: working first',
        { startsAt: at('09:30') },
        SUNDAY_NOON,
        OutsideWorkingHoursError,
      ],
      [
        'overlapping the block and the appointment: block first',
        { startsAt: at('14:30') },
        SUNDAY_NOON,
        BarberUnavailableError,
      ],
    ])(
      'CA-07.5: with several violations, reports the first in order (AVL-25): %s',
      async (_, overrides, now, errorType) => {
        const { useCase, appointments, blocks } = await setup(now);
        for (const [start, end] of [
          ['09:30', '10:00'],
          ['14:30', '14:45'],
        ]) {
          blocks.seed({
            barbershopId: 'barbershop-a',
            barberId: 'ana',
            start: at(start),
            end: at(end),
          });
        }

        await expect(useCase.execute(input(overrides))).rejects.toBeInstanceOf(
          errorType,
        );
        expect(await stored(appointments)).toEqual([SEEDED]);
      },
    );

    it('CA-07.5: the same booking sent twice is refused as a conflict and only one appointment exists', async () => {
      const { useCase, appointments } = await setup();
      await useCase.execute(input());

      await expectRefusal(
        useCase.execute(input()),
        AppointmentConflictError,
        'O barbeiro já tem um agendamento nesse horário.',
        'RN-03',
      );
      expect(
        (await stored(appointments)).filter(
          (appointment) => appointment.id !== 'seeded-1',
        ),
      ).toHaveLength(1);
    });

    it.each([
      ['seconds', new Date('2026-10-05T13:00:30.000Z')],
      ['milliseconds', new Date('2026-10-05T13:00:00.500Z')],
    ])('CA-07.5: a start with %s is an invalid value', async (_, startsAt) => {
      const { useCase, appointments } = await setup();

      await expectRefusal(
        useCase.execute(input({ startsAt })),
        InvalidValueError,
        'Horário inválido.',
        undefined,
      );
      expect(await stored(appointments)).toEqual([SEEDED]);
    });
  });

  describe('RN-26: barber and services (AVL-32 to AVL-35)', () => {
    it.each<
      [
        string,
        Partial<BookAppointmentInput>,
        new (...args: never[]) => DomainError,
        string,
      ]
    >([
      [
        'missing barber',
        { barberId: 'ghost' },
        BarberNotFoundError,
        'Barbeiro não encontrado.',
      ],
      [
        'inactive barber',
        { barberId: 'bia' },
        BarberNotFoundError,
        'Barbeiro não encontrado.',
      ],
      [
        'barber of another barbershop',
        { barberId: 'zeca' },
        BarberNotFoundError,
        'Barbeiro não encontrado.',
      ],
      [
        'missing service',
        { serviceIds: ['haircut', 'ghost'] },
        ServiceNotFoundError,
        'Serviço não encontrado.',
      ],
      [
        'inactive service',
        { serviceIds: ['haircut', 'old'] },
        ServiceNotFoundError,
        'Serviço não encontrado.',
      ],
      [
        'service of another barbershop',
        { serviceIds: ['foreign'] },
        ServiceNotFoundError,
        'Serviço não encontrado.',
      ],
      [
        'empty service list',
        { serviceIds: [] },
        InvalidValueError,
        'Escolha pelo menos um serviço.',
      ],
      [
        'repeated service',
        { serviceIds: ['haircut', 'haircut'] },
        InvalidValueError,
        'Escolha cada serviço uma única vez.',
      ],
    ])(
      'RN-26: refuses a %s and persists nothing (AVL-32, AVL-33, AVL-35)',
      async (_, overrides, errorType, message) => {
        const { useCase, appointments } = await setup();

        await expect(useCase.execute(input(overrides))).rejects.toBeInstanceOf(
          errorType,
        );
        await expect(useCase.execute(input(overrides))).rejects.toThrow(
          message,
        );
        expect(await stored(appointments)).toEqual([SEEDED]);
      },
    );

    it('CA-07.5: refuses a barber who does not perform every service (AVL-34)', async () => {
      const { useCase, appointments, barbers } = await setup();
      await seedBarber(barbers, {
        id: 'caio',
        name: 'Caio',
        serviceIds: ['haircut'],
        workingHours: workingHoursInput({ monday: day('10:00', '17:00') }),
      });

      await expectRefusal(
        useCase.execute(input({ barberId: 'caio' })),
        ServiceNotPerformedError,
        'O barbeiro não realiza todos os serviços escolhidos.',
        undefined,
      );
      expect(await stored(appointments)).toEqual([SEEDED]);
    });
  });

  describe('CA-07.4: conflict reported by the repository', () => {
    // The read happens before another booking commits: the stale read sees
    // nothing, and the repository (the database constraint) refuses the insert.
    const staleRead = (
      real: InMemoryAppointmentRepository,
    ): AppointmentRepository => ({
      listBusyPeriods: (): Promise<BusyPeriod[]> => Promise.resolve([]),
      create: (appointment: Appointment) => real.create(appointment),
      findById: (barbershopId: string, appointmentId: string) =>
        real.findById(barbershopId, appointmentId),
      saveStatus: (appointment: Appointment) => real.saveStatus(appointment),
      claimReminder: () => Promise.resolve(false),
      confirmByClient: () => Promise.resolve(false),
      claimReturnReminder: () => Promise.resolve(false),
    });

    it('CA-07.4: propagates the RN-07 conflict, counts it and persists nothing', async () => {
      const { useCase, appointments, metrics } = await setup(
        SUNDAY_NOON,
        staleRead,
      );

      await expectRefusal(
        useCase.execute(input({ origin: 'bot', startsAt: at('14:00') })),
        AppointmentConflictError,
        'O barbeiro já tem um agendamento nesse horário.',
        'RN-07',
      );
      expect(metrics.conflicts).toEqual(['bot']);
      expect(metrics.bookings).toEqual([]);
      expect(await stored(appointments)).toEqual([SEEDED]);
    });
  });

  describe('metrics (AVL-38, AVL-39)', () => {
    it.each<AppointmentOrigin>(['bot', 'manual'])(
      'AVL-38: an accepted %s booking increments the bookings counter with its origin',
      async (origin) => {
        const { useCase, metrics } = await setup();

        await useCase.execute(input({ origin }));

        expect(metrics.bookings).toEqual([origin]);
        expect(metrics.conflicts).toEqual([]);
      },
    );

    it.each<AppointmentOrigin>(['bot', 'manual'])(
      'AVL-39: a %s booking refused for overlap increments the conflicts counter with its origin',
      async (origin) => {
        const { useCase, metrics } = await setup();

        await expect(
          useCase.execute(input({ origin, startsAt: at('14:30') })),
        ).rejects.toBeInstanceOf(AppointmentConflictError);

        expect(metrics.conflicts).toEqual([origin]);
        expect(metrics.bookings).toEqual([]);
      },
    );
  });
  describe('CA-10.2: the client of the appointment (AGM-05, AGM-06)', () => {
    const joao = Client.create({
      id: 'client-joao',
      barbershopId: 'barbershop-a',
      name: 'João',
      phone: PhoneNumber.create('11987654321'),
      now: SUNDAY_NOON,
    });

    async function setupWithClients(now = SUNDAY_NOON) {
      const clients = new InMemoryClientRepository();
      const appointments = new InMemoryAppointmentRepository(clients);
      const env = await setup(now, () => appointments);
      return { ...env, clients, appointments };
    }

    it('CA-10.2: a new client is stored with the appointment, which carries its id', async () => {
      const { useCase, clients, appointments } = await setupWithClients();

      const appointment = await useCase.execute(
        input({ client: { client: joao, isNew: true } }),
      );

      expect(appointment.clientId).toBe('client-joao');
      const [saved] = await appointments.list('barbershop-a');
      expect(saved.clientId).toBe('client-joao');
      expect(
        clients.list('barbershop-a').map((client) => ({
          id: client.id,
          name: client.name,
          phone: client.phone,
        })),
      ).toEqual([{ id: 'client-joao', name: 'João', phone: '+5511987654321' }]);
    });

    it('CA-10.2: an existing client is linked without storing another one', async () => {
      const { useCase, clients, appointments } = await setupWithClients();
      clients.add(joao);

      const appointment = await useCase.execute(
        input({ client: { client: joao, isNew: false } }),
      );

      expect(appointment.clientId).toBe('client-joao');
      const [saved] = await appointments.list('barbershop-a');
      expect(saved.clientId).toBe('client-joao');
      expect(clients.list('barbershop-a')).toEqual([joao]);
    });

    it('AGD-20: without a client the appointment is stored with a null client', async () => {
      const { useCase, appointments } = await setupWithClients();

      const appointment = await useCase.execute(input());

      expect(appointment.clientId).toBeNull();
      const [saved] = await appointments.list('barbershop-a');
      expect(saved.clientId).toBeNull();
    });

    it('CA-10.3: a manual booking 30 minutes ahead is stored under a 60-minute minimum advance', async () => {
      const { useCase, clients, appointments } = await setupWithClients(
        at('10:00'),
      );

      const appointment = await useCase.execute(
        input({
          origin: 'manual',
          startsAt: at('10:30'),
          client: { client: joao, isNew: true },
        }),
      );

      expect(appointment.startsAt).toEqual(at('10:30'));
      expect(appointment.origin).toBe('manual');
      const saved = await appointments.list('barbershop-a');
      expect(saved.map((stored) => stored.startsAt)).toEqual([at('10:30')]);
      expect(clients.list('barbershop-a')).toHaveLength(1);
    });
  });
});

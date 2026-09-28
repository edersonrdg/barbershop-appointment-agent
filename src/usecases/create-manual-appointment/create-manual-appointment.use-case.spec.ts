import { Client } from '../../domain/entities/client';
import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { BarberUnavailableError } from '../../domain/errors/barber-unavailable.error';
import { ClientPhoneTakenError } from '../../domain/errors/client-phone-taken.error';
import { DomainError } from '../../domain/errors/domain.error';
import { OutsideOpeningHoursError } from '../../domain/errors/outside-opening-hours.error';
import { OutsideWorkingHoursError } from '../../domain/errors/outside-working-hours.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { ServiceNotPerformedError } from '../../domain/errors/service-not-performed.error';
import { SlotInPastError } from '../../domain/errors/slot-in-past.error';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { BookAppointmentUseCase } from '../book-appointment/book-appointment.use-case';
import { ScheduleEntry } from '../ports/schedule.query.port';
import { BarberAccessPolicy } from '../shared/barber-access-policy';
import { day, seedBarber, workingHoursInput } from '../testing/barber-fixtures';
import { CountingAppointmentMetrics } from '../testing/counting-appointment-metrics';
import { InMemoryAppointmentRepository } from '../testing/in-memory-appointment.repository';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { InMemoryClientRepository } from '../testing/in-memory-client.repository';
import { InMemoryScheduleQuery } from '../testing/in-memory-schedule.query';
import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import { at, setupScheduling } from '../testing/scheduling-fixtures';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import {
  CreateManualAppointmentInput,
  CreateManualAppointmentUseCase,
} from './create-manual-appointment.use-case';

// Sunday before MONDAY: nothing on MONDAY is in the past.
const SUNDAY_NOON = new Date('2026-10-04T12:00:00.000Z');

// Reads the entry back from what the fakes stored, as the schedule does from
// the database.
class BookedScheduleQuery extends InMemoryScheduleQuery {
  constructor(
    private readonly appointments: InMemoryAppointmentRepository,
    private readonly clients: InMemoryClientRepository,
    private readonly barbers: InMemoryBarberRepository,
    private readonly services: InMemoryServiceRepository,
  ) {
    super();
  }

  override async findById(
    barbershopId: string,
    appointmentId: string,
  ): Promise<ScheduleEntry | null> {
    const appointment = (await this.appointments.list(barbershopId)).find(
      (stored) => stored.id === appointmentId,
    );
    if (!appointment) return null;
    const barber = await this.barbers.findById(
      barbershopId,
      appointment.barberId,
    );
    const services = await this.services.findByIds(
      barbershopId,
      appointment.serviceIds,
    );
    const client = this.clients
      .list(barbershopId)
      .find((stored) => stored.id === appointment.clientId);
    return {
      id: appointment.id,
      barber: { id: appointment.barberId, name: barber?.name ?? '' },
      client: client
        ? { id: client.id, name: client.name, phone: client.phone }
        : null,
      services: appointment.serviceIds.map((id) => ({
        id,
        name: services.find((service) => service.id === id)?.name ?? '',
      })),
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      origin: appointment.origin,
    };
  }
}

// Barbearia A abre 09:00-18:00 com intervalo 12:00-13:00 na segunda. Ana
// (user-ana) trabalha 10:00-17:00, faz corte (30) e barba (15), tem um
// agendamento 14:00-14:45 e um bloqueio 15:30-16:00. Bruno (user-bruno) faz
// corte e barba 09:00-18:00. Caio só faz corte. Bia está inativa. A barbearia
// B tem um cliente com o telefone +5511987654321.
async function setup(now = SUNDAY_NOON) {
  const env = await setupScheduling(now);
  const clients = new InMemoryClientRepository();
  const appointments = new InMemoryAppointmentRepository(clients);
  await seedBarber(env.barbers, {
    id: 'ana',
    name: 'Ana',
    userId: 'user-ana',
    serviceIds: ['haircut', 'beard'],
    workingHours: workingHoursInput({ monday: day('10:00', '17:00') }),
  });
  await seedBarber(env.barbers, {
    id: 'bruno',
    name: 'Bruno',
    userId: 'user-bruno',
    serviceIds: ['haircut', 'beard'],
  });
  await seedBarber(env.barbers, {
    id: 'caio',
    name: 'Caio',
    serviceIds: ['haircut'],
  });
  await seedBarber(env.barbers, { id: 'bia', name: 'Bia', active: false });
  await seedBarber(env.barbers, {
    id: 'zeca',
    name: 'Zeca',
    barbershopId: 'barbershop-b',
    serviceIds: ['foreign'],
  });
  appointments.seed({
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
  clients.add(
    Client.create({
      id: 'client-b',
      barbershopId: 'barbershop-b',
      name: 'Cliente da B',
      phone: PhoneNumber.create('11987654321'),
      now,
    }),
  );
  const ids = new SequentialIdGenerator();
  const book = new BookAppointmentUseCase(
    env.barbershops,
    env.bookingRules,
    env.barbers,
    env.services,
    appointments,
    env.blocks,
    env.clock,
    ids,
    new CountingAppointmentMetrics(),
  );
  const useCase = new CreateManualAppointmentUseCase(
    new BarberAccessPolicy(env.barbers),
    clients,
    book,
    new BookedScheduleQuery(appointments, clients, env.barbers, env.services),
    ids,
    env.clock,
  );
  const newAppointments = async () =>
    (await appointments.list('barbershop-a')).filter(
      (appointment) => !appointment.id.startsWith('seeded-'),
    );
  const clientsOfA = () =>
    clients.list('barbershop-a').map((client) => ({
      id: client.id,
      name: client.name,
      phone: client.phone,
    }));
  return {
    ...env,
    clients,
    appointments,
    useCase,
    newAppointments,
    clientsOfA,
  };
}

const owner = {
  barbershopId: 'barbershop-a',
  userId: 'owner',
  role: 'owner',
} as const;

function input(
  overrides: Partial<CreateManualAppointmentInput> = {},
): CreateManualAppointmentInput {
  return {
    ...owner,
    barberId: 'ana',
    serviceIds: ['haircut', 'beard'],
    startsAt: at('10:00'),
    client: { name: '  João  ', phone: '11987654321' },
    ...overrides,
  };
}

const joaoOfA = {
  id: 'client-joao',
  barbershopId: 'barbershop-a',
  name: 'João',
  phone: PhoneNumber.create('11987654321'),
  now: SUNDAY_NOON,
};

describe('CreateManualAppointmentUseCase', () => {
  describe('CA-10.1: the owner books for any active barber', () => {
    it('CA-10.1: returns the confirmed manual entry with end = start + durations and services in order (AGM-01, AGM-02, AGM-19)', async () => {
      const { useCase, newAppointments } = await setup();

      const entry = await useCase.execute(input());

      expect(entry).toEqual({
        id: 'id-2',
        barber: { id: 'ana', name: 'Ana' },
        client: { id: 'id-1', name: 'João', phone: '+5511987654321' },
        services: [
          { id: 'haircut', name: 'Corte' },
          { id: 'beard', name: 'Barba' },
        ],
        startsAt: at('10:00'),
        endsAt: at('10:45'),
        status: 'confirmed',
        origin: 'manual',
      });
      const [saved] = await newAppointments();
      expect(saved.id).toBe('id-2');
      expect(saved.origin).toBe('manual');
      expect(saved.clientId).toBe('id-1');
    });
  });

  describe('CA-10.2: the client is identified by the phone', () => {
    it('CA-10.2: a new phone creates the client with the trimmed name and the E.164 phone (AGM-05)', async () => {
      const { useCase, clientsOfA, newAppointments } = await setup();

      await useCase.execute(input());

      expect(clientsOfA()).toEqual([
        { id: 'id-1', name: 'João', phone: '+5511987654321' },
      ]);
      const [saved] = await newAppointments();
      expect(saved.clientId).toBe('id-1');
    });

    it('CA-10.2: an existing phone in another format links the same client and keeps its name (AGM-06)', async () => {
      const { useCase, clients, clientsOfA, newAppointments } = await setup();
      clients.add(Client.create(joaoOfA));

      const entry = await useCase.execute(
        input({
          client: { name: 'Joao Silva', phone: '+55 (11) 98765-4321' },
        }),
      );

      expect(entry.client).toEqual({
        id: 'client-joao',
        name: 'João',
        phone: '+5511987654321',
      });
      expect(clientsOfA()).toEqual([
        { id: 'client-joao', name: 'João', phone: '+5511987654321' },
      ]);
      const [saved] = await newAppointments();
      expect(saved.clientId).toBe('client-joao');
    });

    it('CA-10.2: a phone of a client of another barbershop creates a new client here (AGM-07, RN-26)', async () => {
      const { useCase, clients, clientsOfA } = await setup();

      const entry = await useCase.execute(input());

      expect(entry.client?.id).toBe('id-1');
      expect(clientsOfA()).toEqual([
        { id: 'id-1', name: 'João', phone: '+5511987654321' },
      ]);
      expect(clients.list('barbershop-b').map((client) => client.id)).toEqual([
        'client-b',
      ]);
    });

    it.each<[string, Partial<CreateManualAppointmentInput>, Date]>([
      ['a conflict', { startsAt: at('14:00') }, SUNDAY_NOON],
      ['an RN-05 violation', { startsAt: at('15:30') }, SUNDAY_NOON],
      ['a past start', { startsAt: at('10:00') }, at('10:05')],
    ])(
      'CA-10.2: refused for %s, the new client is not stored (AGM-08)',
      async (_, overrides, now) => {
        const { useCase, clientsOfA, newAppointments } = await setup(now);

        await expect(useCase.execute(input(overrides))).rejects.toBeInstanceOf(
          DomainError,
        );

        expect(clientsOfA()).toEqual([]);
        expect(await newAppointments()).toEqual([]);
      },
    );

    it('CA-10.2: when another request stores the phone first, the retry links that client (AGM-09)', async () => {
      const { useCase, appointments, clientsOfA, newAppointments } =
        await setup();
      appointments.storeClientBeforeNextCreate(
        Client.create({ ...joaoOfA, id: 'client-racer', name: 'João Racer' }),
      );

      const entry = await useCase.execute(input());

      expect(entry.client).toEqual({
        id: 'client-racer',
        name: 'João Racer',
        phone: '+5511987654321',
      });
      expect(clientsOfA()).toEqual([
        { id: 'client-racer', name: 'João Racer', phone: '+5511987654321' },
      ]);
      const saved = await newAppointments();
      expect(saved.map((appointment) => appointment.clientId)).toEqual([
        'client-racer',
      ]);
    });

    it('CA-10.2: a second ClientPhoneTakenError propagates and nothing is booked (AGM-09)', async () => {
      const { useCase, appointments, clients, newAppointments } = await setup();
      // The lookup never sees the stored client, so both attempts collide.
      const lookup = jest.spyOn(clients, 'findByPhone').mockResolvedValue(null);
      clients.add(Client.create(joaoOfA));
      const attempt = useCase.execute(input());

      await expect(attempt).rejects.toBeInstanceOf(ClientPhoneTakenError);
      expect(lookup).toHaveBeenCalledTimes(2);
      expect(await newAppointments()).toEqual([]);
      expect(await appointments.list('barbershop-a')).toHaveLength(1);
    });
  });

  describe('CA-10.4: every refusal of the engine names the rule', () => {
    it.each<
      [
        string,
        Partial<CreateManualAppointmentInput>,
        Date,
        new (...args: never[]) => DomainError,
        string,
      ]
    >([
      [
        'overlap (AGM-10)',
        { startsAt: at('14:30') },
        SUNDAY_NOON,
        AppointmentConflictError,
        'O barbeiro já tem um agendamento nesse horário.',
      ],
      [
        'outside the opening hours (AGM-12)',
        { barberId: 'bruno', startsAt: at('11:45') },
        SUNDAY_NOON,
        OutsideOpeningHoursError,
        'O horário está fora do funcionamento da barbearia.',
      ],
      [
        'outside the working hours (AGM-12)',
        { startsAt: at('09:30') },
        SUNDAY_NOON,
        OutsideWorkingHoursError,
        'O horário está fora da jornada do barbeiro.',
      ],
      [
        'over a block (AGM-12)',
        { startsAt: at('15:15') },
        SUNDAY_NOON,
        BarberUnavailableError,
        'O barbeiro está indisponível nesse horário.',
      ],
      [
        'past start (AGM-13)',
        { startsAt: at('10:00') },
        at('10:05'),
        SlotInPastError,
        'O horário já passou.',
      ],
      [
        'barber without every service (AGM-14)',
        { barberId: 'caio' },
        SUNDAY_NOON,
        ServiceNotPerformedError,
        'O barbeiro não realiza todos os serviços escolhidos.',
      ],
      [
        'inactive barber (AGM-15)',
        { barberId: 'bia' },
        SUNDAY_NOON,
        BarberNotFoundError,
        'Barbeiro não encontrado.',
      ],
      [
        'barber of another barbershop (AGM-15, AGM-27)',
        { barberId: 'zeca' },
        SUNDAY_NOON,
        BarberNotFoundError,
        'Barbeiro não encontrado.',
      ],
      [
        'missing service (AGM-15)',
        { serviceIds: ['haircut', 'ghost'] },
        SUNDAY_NOON,
        ServiceNotFoundError,
        'Serviço não encontrado.',
      ],
      [
        'service of another barbershop (AGM-15, AGM-27)',
        { serviceIds: ['foreign'] },
        SUNDAY_NOON,
        ServiceNotFoundError,
        'Serviço não encontrado.',
      ],
    ])(
      'CA-10.4: %s is refused with its message and nothing is stored',
      async (_, overrides, now, errorType, message) => {
        const { useCase, clientsOfA, newAppointments } = await setup(now);
        const attempt = useCase.execute(input(overrides));

        await expect(attempt).rejects.toBeInstanceOf(errorType);
        await expect(attempt).rejects.toThrow(message);
        expect(await newAppointments()).toEqual([]);
        expect(clientsOfA()).toEqual([]);
      },
    );
  });

  describe('CA-10.4: touching a limit is not a violation', () => {
    it.each<[string, Partial<CreateManualAppointmentInput>, Date]>([
      [
        'ends exactly at the end of the working day',
        { serviceIds: ['haircut'], startsAt: at('16:30') },
        at('17:00'),
      ],
      [
        'ends exactly at the closing time',
        { barberId: 'bruno', startsAt: at('17:15') },
        at('18:00'),
      ],
      [
        'ends exactly when another appointment starts',
        { startsAt: at('13:15') },
        at('14:00'),
      ],
    ])('CA-10.4: books an appointment that %s', async (_, overrides, end) => {
      const { useCase, newAppointments } = await setup();

      const entry = await useCase.execute(input(overrides));

      expect(entry.endsAt).toEqual(end);
      const [saved] = await newAppointments();
      expect(saved.endsAt).toEqual(end);
    });
  });

  describe('CA-10.5: a barber books only their own schedule', () => {
    it('CA-10.5: a barber books for themselves (AGM-17)', async () => {
      const { useCase, newAppointments } = await setup();

      const entry = await useCase.execute(
        input({
          barbershopId: 'barbershop-a',
          userId: 'user-bruno',
          role: 'barber',
          barberId: 'bruno',
        }),
      );

      expect(entry.barber).toEqual({ id: 'bruno', name: 'Bruno' });
      expect(entry.origin).toBe('manual');
      const saved = await newAppointments();
      expect(saved.map((appointment) => appointment.barberId)).toEqual([
        'bruno',
      ]);
    });

    it.each([
      ['for another barber', 'user-bruno', 'ana'],
      ['without a barber record', 'user-nobody', 'ana'],
    ])(
      'CA-10.5: a barber booking %s is denied, with no appointment and no client (AGM-18)',
      async (_, userId, barberId) => {
        const { useCase, clientsOfA, newAppointments } = await setup();
        const attempt = useCase.execute(
          input({
            barbershopId: 'barbershop-a',
            userId,
            role: 'barber',
            barberId,
          }),
        );

        await expect(attempt).rejects.toBeInstanceOf(ScheduleAccessDeniedError);
        await expect(attempt).rejects.toThrow('Acesso negado.');
        expect(await newAppointments()).toEqual([]);
        expect(clientsOfA()).toEqual([]);
      },
    );
  });
});

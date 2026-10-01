import {
  Appointment,
  AppointmentStatus,
} from '../../domain/entities/appointment';
import { Barbershop } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
} from '../../domain/entities/whatsapp-connection';
import { ReminderKind } from '../../domain/value-objects/appointment-reminder';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { AppointmentBackedScheduleQuery } from '../testing/appointment-backed-schedule.query';
import { seedBarber, seedBarbershop } from '../testing/barber-fixtures';
import { CountingWhatsAppMetrics } from '../testing/counting-whatsapp-metrics';
import { FakeWhatsAppConnector } from '../testing/fake-whatsapp-connector';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryAppointmentRepository } from '../testing/in-memory-appointment.repository';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryClientRepository } from '../testing/in-memory-client.repository';
import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import { InMemoryWhatsAppConnectionRepository } from '../testing/in-memory-whatsapp-connection.repository';
import { seedService } from '../testing/service-fixtures';
import { SettableClock } from '../testing/settable-clock';
import { SendAppointmentRemindersUseCase } from './send-appointment-reminders.use-case';

/** Tuesday, 29/09, 12:00 in America/Sao_Paulo. */
const NOW = new Date('2026-09-29T15:00:00.000Z');
const CREATED = new Date('2026-09-27T12:00:00.000Z');
const PHONE = '+5511987654321';
/** Wednesday 30/09 at 11:00 local: its 24h reminder is due. */
const X_STARTS = new Date('2026-09-30T14:00:00.000Z');
/** Tuesday 29/09 at 13:00 local: its 1h reminder is due exactly now. */
const Z_STARTS = new Date('2026-09-29T16:00:00.000Z');

const X_TEXT =
  'Lembrete do seu horário na Barbearia do Zé:\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 11:00\n\nResponda *confirmar* para confirmar presença, *remarcar* para trocar o horário ou *cancelar* para desmarcar.';
const Z_TEXT =
  'Seu horário na Barbearia do Zé é hoje às 13:00, com João. Até já!';

async function setup({
  timezone = 'America/Sao_Paulo',
  connection = 'connected',
}: {
  timezone?: string;
  connection?: WhatsAppConnectionStatus | null;
} = {}) {
  const store = new InMemoryAccountStore();
  const shops = ['barbershop-a', 'barbershop-b'].map((id, index) => {
    const seeded = seedBarbershop(store, id);
    return Barbershop.restore({
      id: seeded.id,
      name: index === 0 ? 'Barbearia do Zé' : 'Barbearia B',
      address: null,
      timezone: BarbershopTimezone.create(timezone),
      openingHours: seeded.openingHours,
      subscriptionStatus: 'trialing',
      trialEndsAt: NOW,
      createdAt: NOW,
    });
  });
  store.barbershops.splice(0, store.barbershops.length, shops[0]);

  const services = new InMemoryServiceRepository();
  await seedService(services, { id: 'corte', name: 'Corte' });
  await seedService(services, { id: 'barba', name: 'Barba' });
  const barbers = new InMemoryBarberRepository();
  await seedBarber(barbers, { id: 'joao', name: 'João' });
  await seedBarber(barbers, {
    id: 'marcos',
    name: 'Marcos',
    barbershopId: 'barbershop-b',
  });
  const clients = new InMemoryClientRepository();
  clients.add(
    Client.create({
      id: 'carlos',
      barbershopId: 'barbershop-a',
      name: 'Carlos Souza',
      phone: PhoneNumber.create(PHONE),
      now: CREATED,
    }),
  );
  clients.add(
    Client.create({
      id: 'bia',
      barbershopId: 'barbershop-b',
      name: 'Bia',
      phone: PhoneNumber.create('+5511911112222'),
      now: CREATED,
    }),
  );
  const appointments = new InMemoryAppointmentRepository(clients);
  const schedule = new AppointmentBackedScheduleQuery(
    appointments,
    barbers,
    services,
    clients,
  );
  const connections = new InMemoryWhatsAppConnectionRepository();
  const connect = async (
    barbershopId: string,
    status: WhatsAppConnectionStatus,
  ): Promise<void> =>
    connections.save(
      WhatsAppConnection.restore({
        barbershopId,
        status,
        disconnectedAt: null,
        updatedAt: NOW,
      }),
    );
  if (connection) await connect('barbershop-a', connection);
  const connector = new FakeWhatsAppConnector();
  const metrics = new CountingWhatsAppMetrics();
  const clock = new SettableClock(NOW);
  const barbershops = new InMemoryBarbershopRepository(store);
  const useCase = new SendAppointmentRemindersUseCase(
    barbershops,
    connections,
    schedule,
    appointments,
    connector,
    metrics,
    clock,
  );

  const seed = async ({
    id,
    startsAt,
    createdAt = CREATED,
    status = 'confirmed',
    clientId = 'carlos',
    serviceIds = ['corte'],
    barbershopId = 'barbershop-a',
    barberId = 'joao',
  }: {
    id: string;
    startsAt: Date;
    createdAt?: Date;
    status?: AppointmentStatus;
    clientId?: string | null;
    serviceIds?: string[];
    barbershopId?: string;
    barberId?: string;
  }): Promise<void> => {
    await appointments.create(
      Appointment.restore({
        id,
        barbershopId,
        barberId,
        clientId,
        serviceIds,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
        status: 'confirmed',
        origin: 'bot',
        createdAt,
      }),
    );
    if (status !== 'confirmed') {
      const stored = await appointments.findById(barbershopId, id);
      await appointments.saveStatus(
        Appointment.restore({ ...propsOf(stored!), status }),
      );
    }
  };
  const marks = (id: string, barbershopId = 'barbershop-a') =>
    appointments.marksOf(barbershopId, id);

  return {
    useCase,
    store,
    shops,
    appointments,
    connector,
    connect,
    metrics,
    clock,
    seed,
    marks,
  };
}

function propsOf(appointment: Appointment) {
  return {
    id: appointment.id,
    barbershopId: appointment.barbershopId,
    barberId: appointment.barberId,
    clientId: appointment.clientId,
    serviceIds: [...appointment.serviceIds],
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    status: appointment.status,
    origin: appointment.origin,
    createdAt: appointment.createdAt,
  };
}

describe('US-19 SendAppointmentRemindersUseCase', () => {
  describe('S1: 24h reminder', () => {
    it('CA-19.1, AC 1, AC 2 (C2): sends the 24h reminder once and records when', async () => {
      const { useCase, connector, seed, marks } = await setup();
      await seed({ id: 'x', startsAt: X_STARTS });

      await useCase.execute();

      expect(connector.sentTexts).toEqual([
        { barbershopId: 'barbershop-a', phone: PHONE, text: X_TEXT },
      ]);
      expect(marks('x').reminder24hSentAt).toEqual(NOW);

      await useCase.execute();

      expect(connector.sentTexts).toHaveLength(1);
    });

    it('AC 2 (C3): lists every service of the appointment', async () => {
      const { useCase, connector, seed } = await setup();
      await seed({
        id: 'x',
        startsAt: X_STARTS,
        serviceIds: ['corte', 'barba'],
      });

      await useCase.execute();

      expect(connector.sentTexts[0].text.split('\n')[1]).toBe(
        'Serviços: Corte, Barba',
      );
    });

    it('RNF-04, AC 2 (C3): writes the date and time in the barbershop timezone', async () => {
      const { useCase, connector, seed } = await setup({
        timezone: 'America/Manaus',
      });
      await seed({ id: 'x', startsAt: X_STARTS });

      await useCase.execute();

      const lines = connector.sentTexts[0].text.split('\n');
      expect(lines[3]).toBe('Data: quarta-feira, 30/09');
      expect(lines[4]).toBe('Horário: 10:00');
    });

    it('AC 3 (C4): a failed send keeps the reminder recorded, counts it and the run goes on', async () => {
      const { useCase, connector, seed, marks, metrics } = await setup();
      await seed({ id: 'x', startsAt: X_STARTS });
      await seed({
        id: 'y',
        startsAt: new Date('2026-09-30T14:30:00.000Z'),
        serviceIds: ['barba'],
      });
      let sends = 0;
      const send = connector.sendText.bind(connector);
      connector.sendText = (barbershopId, phone, text) => {
        sends += 1;
        return sends === 1
          ? Promise.reject(new Error('vendor down'))
          : send(barbershopId, phone, text);
      };

      const result = await useCase.execute();

      expect(result).toEqual({ sent: 1, failed: 1, failures: [] });
      expect(marks('x').reminder24hSentAt).toEqual(NOW);
      expect(marks('y').reminder24hSentAt).toEqual(NOW);
      expect(metrics.reminders).toEqual([
        { kind: '24h', outcome: 'failed' },
        { kind: '24h', outcome: 'sent' },
      ]);

      connector.sendText = send;
      connector.sentTexts.length = 0;
      await useCase.execute();

      expect(connector.sentTexts).toEqual([]);
    });
  });

  describe('S2: 1h reminder', () => {
    it('CA-19.3, AC 4 (C6): sends the 1h reminder once and records when', async () => {
      const { useCase, connector, seed, marks } = await setup();
      await seed({ id: 'z', startsAt: Z_STARTS });

      await useCase.execute();

      expect(connector.sentTexts).toEqual([
        { barbershopId: 'barbershop-a', phone: PHONE, text: Z_TEXT },
      ]);
      expect(marks('z').reminder1hSentAt).toEqual(NOW);

      await useCase.execute();

      expect(connector.sentTexts).toHaveLength(1);
    });

    it.each<[string, Parameters<InMemoryAppointmentRepository['setMarks']>[2]]>(
      [
        ['already confirmed by the client', { clientConfirmedAt: CREATED }],
        ['without the 24h reminder', { reminder24hSentAt: null }],
      ],
    )('AC 5 (C7): sends the 1h reminder when %s', async (_case, state) => {
      const { useCase, connector, seed, appointments } = await setup();
      await seed({ id: 'z', startsAt: Z_STARTS });
      appointments.setMarks('barbershop-a', 'z', state);

      await useCase.execute();

      expect(connector.sentTexts).toEqual([
        { barbershopId: 'barbershop-a', phone: PHONE, text: Z_TEXT },
      ]);
    });

    it('AC 6 (C8): a failed 1h send keeps the reminder recorded and counts it', async () => {
      const { useCase, connector, seed, marks, metrics } = await setup();
      await seed({ id: 'z', startsAt: Z_STARTS });
      connector.failing.add('sendText');

      const result = await useCase.execute();

      expect(result).toEqual({ sent: 0, failed: 1, failures: [] });
      expect(marks('z').reminder1hSentAt).toEqual(NOW);
      expect(metrics.reminders).toEqual([{ kind: '1h', outcome: 'failed' }]);

      connector.failing.clear();
      await useCase.execute();

      expect(connector.sentTexts).toEqual([]);
    });
  });

  describe('S3: reminders that do not go out', () => {
    it('CA-19.4, AC 7 (C9): an appointment created 3h before gets only the 1h reminder', async () => {
      const { useCase, connector, seed, clock } = await setup();
      const startsAt = new Date('2026-09-29T18:00:00.000Z');
      await seed({ id: 'late', startsAt, createdAt: NOW });

      await useCase.execute();

      expect(connector.sentTexts).toEqual([]);

      clock.current = new Date('2026-09-29T17:01:00.000Z');
      await useCase.execute();

      expect(connector.sentTexts).toEqual([
        {
          barbershopId: 'barbershop-a',
          phone: PHONE,
          text: 'Seu horário na Barbearia do Zé é hoje às 15:00, com João. Até já!',
        },
      ]);
    });

    it.each<AppointmentStatus>(['cancelled', 'attended', 'no_show'])(
      'CA-19.6, AC 8 (C10): an appointment %s gets no reminder',
      async (status) => {
        const { useCase, connector, seed, marks } = await setup();
        await seed({ id: 'x', startsAt: X_STARTS, status });
        await seed({ id: 'z', startsAt: Z_STARTS, status });

        await useCase.execute();

        expect(connector.sentTexts).toEqual([]);
        for (const id of ['x', 'z']) {
          expect(marks(id).reminder24hSentAt).toBeNull();
          expect(marks(id).reminder1hSentAt).toBeNull();
        }
      },
    );

    it('CA-19.6, AC 9 (C11): an appointment cancelled between the listing and the claim gets no reminder', async () => {
      const { useCase, connector, seed, marks, appointments } = await setup();
      await seed({ id: 'x', startsAt: X_STARTS });
      const claim = appointments.claimReminder.bind(appointments);
      appointments.claimReminder = async (barbershopId, id, kind, now) => {
        const stored = await appointments.findById(barbershopId, id);
        await appointments.saveStatus(stored!.cancel());
        return claim(barbershopId, id, kind, now);
      };

      await useCase.execute();

      expect(connector.sentTexts).toEqual([]);
      expect(marks('x').reminder24hSentAt).toBeNull();
    });

    it('AC 10 (C12): an appointment without a client gets no reminder', async () => {
      const { useCase, connector, seed, marks } = await setup();
      await seed({ id: 'x', startsAt: X_STARTS, clientId: null });

      await useCase.execute();

      expect(connector.sentTexts).toEqual([]);
      expect(marks('x').reminder24hSentAt).toBeNull();
    });

    it.each<[string, WhatsAppConnectionStatus | null]>([
      ['no connection', null],
      ['disconnected', 'disconnected'],
      ['connecting', 'connecting'],
    ])(
      'AC 11 (C13): with %s nothing is claimed, and the reminder goes out once connected',
      async (_case, connection) => {
        const { useCase, connector, seed, marks, connect } = await setup({
          connection,
        });
        await seed({ id: 'x', startsAt: X_STARTS });

        await useCase.execute();

        expect(connector.sentTexts).toEqual([]);
        expect(marks('x').reminder24hSentAt).toBeNull();

        await connect('barbershop-a', 'connected');
        await useCase.execute();

        expect(connector.sentTexts).toHaveLength(1);
      },
    );

    it('AD-009, RN-26 (C15): each barbershop reminds its own clients, and a failing one does not stop the next', async () => {
      const { useCase, connector, seed, store, shops, connect, appointments } =
        await setup();
      store.barbershops.push(shops[1]);
      await connect('barbershop-b', 'connected');
      await seed({ id: 'x', startsAt: X_STARTS });
      await seed({
        id: 'bx',
        startsAt: X_STARTS,
        barbershopId: 'barbershop-b',
        barberId: 'marcos',
        clientId: 'bia',
      });

      await useCase.execute();

      expect(
        connector.sentTexts.map(({ barbershopId, phone }) => ({
          barbershopId,
          phone,
        })),
      ).toEqual([
        { barbershopId: 'barbershop-a', phone: PHONE },
        { barbershopId: 'barbershop-b', phone: '+5511911112222' },
      ]);

      const failure = new Error('database down');
      connector.sentTexts.length = 0;
      appointments.setMarks('barbershop-a', 'x', { reminder24hSentAt: null });
      appointments.setMarks('barbershop-b', 'bx', { reminder24hSentAt: null });
      const claim = appointments.claimReminder.bind(appointments);
      appointments.claimReminder = (
        barbershopId: string,
        id: string,
        kind: ReminderKind,
        now: Date,
      ) =>
        barbershopId === 'barbershop-a'
          ? Promise.reject(failure)
          : claim(barbershopId, id, kind, now);

      const result = await useCase.execute();

      expect(result.failures).toEqual([
        { barbershopId: 'barbershop-a', error: failure },
      ]);
      expect(
        connector.sentTexts.map(({ barbershopId }) => barbershopId),
      ).toEqual(['barbershop-b']);
    });
  });
});

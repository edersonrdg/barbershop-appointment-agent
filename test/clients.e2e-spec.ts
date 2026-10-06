import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ResponseObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { buildApiDocument } from '../src/infrastructure/http/api-docs/api-document';
import { CLOCK } from '../src/usecases/ports/clock.port';
import { EMAIL_SENDER } from '../src/usecases/ports/email-sender.port';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { FixedClock } from '../src/usecases/testing/fixed-clock';
import { createBarber, signupOwner } from './support/account-flows';
import { truncateAccountTables } from './support/truncate-account-tables';
import { stopScheduledJobs } from './support/stop-scheduled-jobs';

const UNAUTHORIZED = { message: 'Sessão inválida ou expirada.' };
const CLIENT_NOT_FOUND = { message: 'Cliente não encontrado.' };
const SEARCH_MESSAGE = 'Informe de 2 a 80 caracteres para buscar.';
const CLIENT_ID_MESSAGE = 'Informe um id de cliente válido.';
const FORBIDDEN = { message: 'Acesso negado.' };
const SUSPENDED_WRITE =
  'A assinatura desta barbearia está inativa. O painel está em modo leitura até a assinatura ser regularizada.';

// Saturday 2026-10-10, 12:00 in São Paulo (UTC-3).
const NOW = new Date('2026-10-10T15:00:00.000Z');
const ISO_SATURDAY = 6;
const JOAO_PHONE = '+5511987654321';
const MARIA_PHONE = '+5521912345678';
const PROFILE_KEYS = [
  'id',
  'name',
  'phone',
  'noShowCount',
  'selfBookingBlocked',
  'returnReminderEnabled',
  'timezone',
  'pastAppointments',
  'upcomingAppointments',
  'topServices',
].sort();

const RULES = {
  minimumAdvanceMinutes: 60,
  cancellationDeadlineMinutes: 120,
  noShowLimit: 2,
  waitlistOfferMinutes: 15,
  returnReminderDays: 30,
};

interface ClientItem {
  id: string;
  name: string;
  phone: string;
}

interface AppointmentItem {
  id: string;
  barber: { id: string; name: string };
  client: { id: string; name: string; phone: string } | null;
  services: { id: string; name: string }[];
  startsAt: string;
  endsAt: string;
  status: string;
  origin: string;
}

interface ProfileBody {
  id: string;
  name: string;
  phone: string;
  noShowCount: number;
  selfBookingBlocked: boolean;
  returnReminderEnabled: boolean;
  timezone: string;
  pastAppointments: AppointmentItem[];
  upcomingAppointments: AppointmentItem[];
  topServices: { id: string; name: string; count: number }[];
}

describe('Clients (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;

  let shopA: string;
  let shopB: string;
  let ownerToken: string;
  let brunoToken: string;
  let caioToken: string;
  let ownerBToken: string;
  let ana: string;
  let bruno: string;
  let haircut: string;
  let beard: string;
  let joao: string;
  let maria: string;

  async function barbershopOf(email: string): Promise<string> {
    const [row] = await dataSource.query<{ barbershop_id: string }[]>(
      'SELECT barbershop_id FROM users WHERE email = $1',
      [email],
    );
    return row.barbershop_id;
  }

  async function userIdOf(email: string): Promise<string> {
    const [row] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    return row.id;
  }

  async function insertService(name: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, 4500, 30, true, now())`,
      [id, shopA, name],
    );
    return id;
  }

  async function insertBarber(
    name: string,
    userId: string | null = null,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, $4, true, now())`,
      [id, shopA, name, userId],
    );
    await dataSource.query(
      `INSERT INTO barber_services (barber_id, service_id, barbershop_id, position)
       VALUES ($1, $2, $3, 0)`,
      [id, haircut, shopA],
    );
    await dataSource.query(
      `INSERT INTO barber_working_hours (barber_id, weekday, starts_at, ends_at)
       VALUES ($1, $2, '09:00', '18:00')`,
      [id, ISO_SATURDAY],
    );
    return id;
  }

  async function insertClient(
    name: string,
    phone: string,
    barbershopId = shopA,
    id = randomUUID(),
  ): Promise<string> {
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [id, barbershopId, name, phone],
    );
    return id;
  }

  async function insertAppointment({
    startsAt,
    barberId = ana,
    clientId = joao,
    status = 'confirmed',
    serviceIds = [haircut],
  }: {
    startsAt: string;
    barberId?: string;
    clientId?: string;
    status?: string;
    serviceIds?: string[];
  }): Promise<string> {
    const id = randomUUID();
    const start = new Date(startsAt);
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', now())`,
      [
        id,
        shopA,
        barberId,
        clientId,
        start,
        new Date(start.getTime() + 30 * 60 * 1000),
        status,
      ],
    );
    for (const [position, serviceId] of serviceIds.entries()) {
      await dataSource.query(
        `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
         VALUES ($1, $2, $3, $4)`,
        [id, position, serviceId, shopA],
      );
    }
    return id;
  }

  function search(query: Record<string, string>, token?: string) {
    const call = request(app.getHttpServer()).get('/clients').query(query);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  async function found(
    query: Record<string, string>,
    token = ownerToken,
  ): Promise<ClientItem[]> {
    const response = await search(query, token).expect(200);
    return (response.body as { clients: ClientItem[] }).clients;
  }

  async function foundIds(
    query: Record<string, string>,
    token = ownerToken,
  ): Promise<string[]> {
    return (await found(query, token)).map((client) => client.id);
  }

  function getProfile(id: string, token?: string) {
    const call = request(app.getHttpServer()).get(`/clients/${id}`);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  async function profileOf(id: string, token = ownerToken) {
    const response = await getProfile(id, token).expect(200);
    return response.body as ProfileBody;
  }

  const ids = (items: { id: string }[]) => items.map((item) => item.id);

  beforeAll(async () => {
    emailSender = new FakeEmailSender();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(NOW))
      .compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>();
    await app.init();
    stopScheduledJobs(app);
    dataSource = app.get(DataSource);
    appWebUrl = app.get(ConfigService).getOrThrow<string>('APP_WEB_URL');
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    ({ accessToken: ownerToken } = await signupOwner(app, 'dono@a.com'));
    brunoToken = await createBarber(
      app,
      emailSender,
      appWebUrl,
      ownerToken,
      'bruno@a.com',
      'Bruno',
    );
    caioToken = await createBarber(
      app,
      emailSender,
      appWebUrl,
      ownerToken,
      'caio@a.com',
      'Caio',
    );
    ({ accessToken: ownerBToken } = await signupOwner(
      app,
      'dono@b.com',
      'Barbearia B',
    ));
    shopA = await barbershopOf('dono@a.com');
    shopB = await barbershopOf('dono@b.com');
    await dataSource.query(
      `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '09:00', '18:00')`,
      [shopA, ISO_SATURDAY],
    );
    haircut = await insertService('Corte');
    beard = await insertService('Barba');
    ana = await insertBarber('Ana');
    bruno = await insertBarber('Bruno', await userIdOf('bruno@a.com'));
    joao = await insertClient('João Silva', JOAO_PHONE);
    maria = await insertClient('Maria', MARIA_PHONE);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('CA-12.1: searching clients', () => {
    it('CA-12.1 (C1): finds a client by part of the name, ignoring case', async () => {
      expect(await found({ q: 'joão' })).toEqual([
        { id: joao, name: 'João Silva', phone: JOAO_PHONE },
      ]);
      expect(await foundIds({ q: 'JOÃO' })).toEqual([joao]);
      expect(await foundIds({ q: 'silv' })).toEqual([joao]);
    });

    it('CA-12.1 (C2): a term with 4 or more digits matches the phone digits, a shorter one does not', async () => {
      expect(await foundIds({ q: '98765' })).toEqual([joao]);
      expect(await foundIds({ q: '(11) 98765' })).toEqual([joao]);
      expect(await foundIds({ q: '1234' })).toEqual([maria]);
      expect(await foundIds({ q: '987' })).toEqual([]);
    });

    it('CA-12.1 (C3): without a term, answers every client of the barbershop', async () => {
      expect(await foundIds({})).toEqual([joao, maria]);
    });

    it('CA-12.1 (C4): answers at most 50 clients ordered by case-insensitive name, each with only id, name and phone', async () => {
      await insertClient('ana', '+5511900000100');
      await insertClient('Bruno', '+5511900000101');
      for (let index = 1; index <= 47; index += 1) {
        const suffix = String(index).padStart(2, '0');
        await insertClient(`Cliente ${suffix}`, `+55119000002${suffix}`);
      }

      const clients = await found({});

      expect(clients.map((client) => client.name)).toEqual([
        'ana',
        'Bruno',
        ...Array.from(
          { length: 47 },
          (_, index) => `Cliente ${String(index + 1).padStart(2, '0')}`,
        ),
        'João Silva',
      ]);
      for (const client of clients) {
        expect(Object.keys(client).sort()).toEqual(['id', 'name', 'phone']);
      }
    });

    it('CA-12.1 (C4): clients with the same name are ordered by id', async () => {
      const last = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
      const first = '00000000-0000-4000-8000-000000000000';
      await insertClient('Zeca', '+5511900000301', shopA, last);
      await insertClient('Zeca', '+5511900000302', shopA, first);

      expect(await foundIds({ q: 'Zeca' })).toEqual([first, last]);
    });

    it('CA-12.1 (C5): a term without a match answers an empty list', async () => {
      const response = await search({ q: 'Xavier' }, ownerToken).expect(200);

      expect(response.body).toEqual({ clients: [] });
    });

    it('CA-12.1 (C6): a one-character term answers 400 with the message', async () => {
      const response = await search({ q: 'a' }, ownerToken).expect(400);

      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [{ field: 'q', message: SEARCH_MESSAGE }],
      });
    });

    it('CA-12.1 (C7): % and _ are matched literally, not as wildcards', async () => {
      const promo = await insertClient('Promo 50%', '+5511900000401');

      expect(await foundIds({ q: '%%' })).toEqual([]);
      expect(await foundIds({ q: '__' })).toEqual([]);
      expect(await foundIds({ q: '50%' })).toEqual([promo]);
    });

    it('CA-12.1 (C8): never answers clients of another barbershop (RN-26)', async () => {
      const joaoOfB = await insertClient('João Silva', JOAO_PHONE, shopB);

      expect(await foundIds({ q: 'joão' }, ownerBToken)).toEqual([joaoOfB]);
      expect(await foundIds({}, ownerBToken)).toEqual([joaoOfB]);
      expect(await foundIds({ q: '98765' }, ownerBToken)).toEqual([joaoOfB]);
    });

    it('CA-12.1 (C27): the owner finds a client without any appointment', async () => {
      expect(await foundIds({ q: 'Maria' })).toEqual([maria]);
      await profileOf(maria);
    });
  });

  describe('CA-12.2: client profile', () => {
    it('CA-12.2 (C9): answers the profile keys and appointments in the schedule item format', async () => {
      const attended = await insertAppointment({
        startsAt: '2026-10-03T13:00:00.000Z',
        status: 'attended',
        serviceIds: [haircut, beard],
      });

      const body = await profileOf(joao);

      expect(Object.keys(body).sort()).toEqual(PROFILE_KEYS);
      expect(body).toMatchObject({
        id: joao,
        name: 'João Silva',
        phone: JOAO_PHONE,
        timezone: 'America/Sao_Paulo',
      });
      expect(body.pastAppointments).toEqual([
        {
          id: attended,
          barber: { id: ana, name: 'Ana' },
          client: { id: joao, name: 'João Silva', phone: JOAO_PHONE },
          services: [
            { id: haircut, name: 'Corte' },
            { id: beard, name: 'Barba' },
          ],
          startsAt: '2026-10-03T13:00:00.000Z',
          endsAt: '2026-10-03T13:30:00.000Z',
          status: 'attended',
          origin: 'manual',
          clientConfirmedAt: null,
        },
      ]);
    });

    it('CA-12.2 (C10): past appointments start at or before now, in any status, most recent first', async () => {
      const old = await insertAppointment({
        startsAt: '2026-09-01T13:00:00.000Z',
        status: 'attended',
      });
      const noShow = await insertAppointment({
        startsAt: '2026-09-20T13:00:00.000Z',
        status: 'no_show',
      });
      const unmarked = await insertAppointment({
        startsAt: '2026-10-10T13:00:00.000Z',
      });
      const startingNow = await insertAppointment({
        startsAt: NOW.toISOString(),
        barberId: bruno,
      });
      await insertAppointment({ startsAt: '2026-10-10T16:00:00.000Z' });

      const body = await profileOf(joao);

      expect(ids(body.pastAppointments)).toEqual([
        startingNow,
        unmarked,
        noShow,
        old,
      ]);
    });

    it('CA-12.2 (C11): upcoming appointments start after now, the nearest first', async () => {
      await insertAppointment({ startsAt: NOW.toISOString() });
      const nextWeek = await insertAppointment({
        startsAt: '2026-10-17T13:00:00.000Z',
      });
      const laterToday = await insertAppointment({
        startsAt: '2026-10-10T16:00:00.000Z',
      });

      const body = await profileOf(joao);

      expect(ids(body.upcomingAppointments)).toEqual([laterToday, nextWeek]);
    });

    it('CA-12.2 (C12): top services come from attended appointments, by count', async () => {
      await insertAppointment({
        startsAt: '2026-09-01T13:00:00.000Z',
        status: 'attended',
      });
      await insertAppointment({
        startsAt: '2026-09-08T13:00:00.000Z',
        status: 'attended',
        serviceIds: [haircut, beard],
      });
      for (const day of ['15', '22', '29']) {
        await insertAppointment({
          startsAt: `2026-09-${day}T13:00:00.000Z`,
          status: 'no_show',
          serviceIds: [beard],
        });
      }
      await insertAppointment({
        startsAt: '2026-10-17T13:00:00.000Z',
        serviceIds: [beard],
      });

      const body = await profileOf(joao);

      expect(body.topServices).toEqual([
        { id: haircut, name: 'Corte', count: 2 },
        { id: beard, name: 'Barba', count: 1 },
      ]);
    });

    it('CA-12.2 (C13): no-shows count since the last reset and the block follows the limit in force', async () => {
      await insertAppointment({
        startsAt: '2026-06-01T13:00:00.000Z',
        status: 'no_show',
      });
      await dataSource.query(
        `UPDATE clients SET no_show_reset_at = '2026-07-01T00:00:00Z' WHERE id = $1`,
        [joao],
      );
      await insertAppointment({
        startsAt: '2026-09-01T13:00:00.000Z',
        status: 'no_show',
      });
      await insertAppointment({
        startsAt: '2026-09-08T13:00:00.000Z',
        status: 'no_show',
        barberId: bruno,
      });
      await request(app.getHttpServer())
        .put('/settings/rules')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(RULES)
        .expect(200);

      expect(await profileOf(joao)).toMatchObject({
        noShowCount: 2,
        selfBookingBlocked: true,
      });

      await request(app.getHttpServer())
        .put('/settings/rules')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...RULES, noShowLimit: 3 })
        .expect(200);

      expect(await profileOf(joao)).toMatchObject({
        noShowCount: 2,
        selfBookingBlocked: false,
      });
    });

    it('CA-12.2 (C14): the return reminder is the stored value, off for inserted and manually booked clients', async () => {
      expect((await profileOf(joao)).returnReminderEnabled).toBe(false);

      await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          barberId: ana,
          serviceIds: [haircut],
          startsAt: '2026-10-10T19:00:00.000Z',
          client: { name: 'Pedro', phone: '(31) 91234-5678' },
        })
        .expect(201);
      const [pedro] = await foundIds({ q: 'Pedro' });
      expect((await profileOf(pedro)).returnReminderEnabled).toBe(false);

      await dataSource.query(
        'UPDATE clients SET return_reminder_enabled = true WHERE id = $1',
        [joao],
      );
      expect((await profileOf(joao)).returnReminderEnabled).toBe(true);
    });

    it('CA-12.2 (C15): a client without appointments answers empty lists and no no-shows', async () => {
      const body = await profileOf(maria);

      expect(body).toMatchObject({
        pastAppointments: [],
        upcomingAppointments: [],
        topServices: [],
        noShowCount: 0,
        selfBookingBlocked: false,
      });
    });

    it('CA-12.2 (C16): an id that is not a UUID answers 400 with the message', async () => {
      const response = await getProfile('abc', ownerToken).expect(400);

      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [{ field: 'id', message: CLIENT_ID_MESSAGE }],
      });
    });

    it('CA-12.2 (C17): an unknown id or a client of another barbershop answers 404 (RN-26)', async () => {
      const joaoOfB = await insertClient('João Silva', JOAO_PHONE, shopB);

      await getProfile(randomUUID(), ownerToken).expect(404, CLIENT_NOT_FOUND);
      await getProfile(joaoOfB, ownerToken).expect(404, CLIENT_NOT_FOUND);
    });
  });

  describe('CA-12.3: a barber only reaches their own clients', () => {
    it('CA-12.3 (C20): a barber only finds clients with an appointment of their own, in any status', async () => {
      await insertAppointment({
        startsAt: '2026-09-01T13:00:00.000Z',
        barberId: bruno,
        status: 'no_show',
      });
      await insertAppointment({
        startsAt: '2026-09-02T13:00:00.000Z',
        clientId: maria,
      });

      expect(await foundIds({}, brunoToken)).toEqual([joao]);
      expect(await foundIds({ q: 'Maria' }, brunoToken)).toEqual([]);
    });

    it('CA-12.3 (C21): a barber sees only their own appointments and top services in the profile', async () => {
      const brunoPast = await insertAppointment({
        startsAt: '2026-09-01T13:00:00.000Z',
        barberId: bruno,
        status: 'attended',
        serviceIds: [beard],
      });
      const brunoNext = await insertAppointment({
        startsAt: '2026-10-17T13:00:00.000Z',
        barberId: bruno,
      });
      await insertAppointment({
        startsAt: '2026-09-02T13:00:00.000Z',
        status: 'attended',
      });
      await insertAppointment({ startsAt: '2026-10-18T13:00:00.000Z' });

      const body = await profileOf(joao, brunoToken);

      expect(ids(body.pastAppointments)).toEqual([brunoPast]);
      expect(ids(body.upcomingAppointments)).toEqual([brunoNext]);
      expect(body.topServices).toEqual([
        { id: beard, name: 'Barba', count: 1 },
      ]);
    });

    it('CA-12.3 (C22): the no-show count in the barber view includes no-shows with other barbers', async () => {
      await insertAppointment({
        startsAt: '2026-09-01T13:00:00.000Z',
        barberId: bruno,
        status: 'attended',
      });
      await insertAppointment({
        startsAt: '2026-09-02T13:00:00.000Z',
        status: 'no_show',
      });

      expect(await profileOf(joao, brunoToken)).toMatchObject({
        noShowCount: 1,
      });
    });

    it('CA-12.3 (C23): a barber opening a client without an appointment of their own gets 404', async () => {
      await insertAppointment({
        startsAt: '2026-09-02T13:00:00.000Z',
        clientId: maria,
      });

      await getProfile(maria, brunoToken).expect(404, CLIENT_NOT_FOUND);
    });

    it('CA-12.3 (C24): a barber user without a barber record finds nobody and gets 404 on a profile', async () => {
      await insertAppointment({ startsAt: '2026-09-02T13:00:00.000Z' });

      const response = await search({}, caioToken).expect(200);
      expect(response.body).toEqual({ clients: [] });
      await getProfile(joao, caioToken).expect(404, CLIENT_NOT_FOUND);
    });

    it('CA-12.3 (C25): both routes answer 401 without a session', async () => {
      await search({}).expect(401, UNAUTHORIZED);
      await getProfile(joao).expect(401, UNAUTHORIZED);
    });
  });

  describe('US-22: unblocking a client', () => {
    function unblock(id: string, token?: string) {
      const call = request(app.getHttpServer()).post(`/clients/${id}/unblock`);
      return token ? call.set('Authorization', `Bearer ${token}`) : call;
    }

    async function resetAtOf(id: string): Promise<Date | null> {
      const [row] = await dataSource.query<{ no_show_reset_at: Date | null }[]>(
        'SELECT no_show_reset_at FROM clients WHERE id = $1',
        [id],
      );
      return row.no_show_reset_at;
    }

    // Default limit of 2 no-shows (AD-008): João is blocked.
    async function blockJoao(): Promise<void> {
      await insertAppointment({
        startsAt: '2026-09-01T13:00:00.000Z',
        status: 'no_show',
      });
      await insertAppointment({
        startsAt: '2026-09-08T13:00:00.000Z',
        status: 'no_show',
      });
      expect(await profileOf(joao)).toMatchObject({
        noShowCount: 2,
        selfBookingBlocked: true,
      });
    }

    it('CA-22.1 (C1): the owner unblocks a blocked client with 204 and the reset is now', async () => {
      await blockJoao();

      const response = await unblock(joao, ownerToken).expect(204);

      expect(response.body).toEqual({});
      expect(response.text).toBe('');
      expect(await resetAtOf(joao)).toEqual(NOW);
    });

    it('CA-22.1 (C2): the profile of an unblocked client shows no no-shows and no block', async () => {
      await blockJoao();

      await unblock(joao, ownerToken).expect(204);

      expect(await profileOf(joao)).toMatchObject({
        noShowCount: 0,
        selfBookingBlocked: false,
      });
    });

    it('CA-22.1 (C4): only no-shows of appointments starting after the unblock count', async () => {
      await blockJoao();
      await unblock(joao, ownerToken).expect(204);

      await insertAppointment({
        startsAt: '2026-10-10T13:00:00.000Z',
        status: 'no_show',
      });
      expect((await profileOf(joao)).noShowCount).toBe(0);

      await insertAppointment({
        startsAt: '2026-10-10T16:00:00.000Z',
        status: 'no_show',
      });
      expect((await profileOf(joao)).noShowCount).toBe(1);
    });

    it('AC 5 (C5): a client below the limit is answered 204 and keeps the no-shows', async () => {
      await insertAppointment({
        startsAt: '2026-09-01T13:00:00.000Z',
        clientId: maria,
        status: 'no_show',
      });

      await unblock(maria, ownerToken).expect(204);

      expect(await profileOf(maria)).toMatchObject({
        noShowCount: 1,
        selfBookingBlocked: false,
      });
      expect(await resetAtOf(maria)).toBeNull();
    });

    it('AC 5 (C5): unblocking twice answers 204 both times and keeps the first reset', async () => {
      await blockJoao();

      await unblock(joao, ownerToken).expect(204);
      await unblock(joao, ownerToken).expect(204);

      expect(await resetAtOf(joao)).toEqual(NOW);
      expect((await profileOf(joao)).noShowCount).toBe(0);
    });

    it('AC 6 (C6): an id that is not a UUID answers 400 with the message', async () => {
      const response = await unblock('abc', ownerToken).expect(400);

      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [{ field: 'id', message: CLIENT_ID_MESSAGE }],
      });
    });

    it('AC 7 (C7): an unknown id or a client of another barbershop answers 404 and resets nothing (RN-26)', async () => {
      const foreign = await insertClient('Pedro', JOAO_PHONE, shopB);
      const barberB = randomUUID();
      await dataSource.query(
        `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
         VALUES ($1, $2, 'Barbeiro B', NULL, true, now())`,
        [barberB, shopB],
      );
      for (const startsAt of [
        '2026-09-01T13:00:00.000Z',
        '2026-09-08T13:00:00.000Z',
      ]) {
        await dataSource.query(
          `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
           VALUES ($1, $2, $3, $4, $5, $5::timestamptz + interval '30 minutes', 'no_show', 'manual', now())`,
          [randomUUID(), shopB, barberB, foreign, startsAt],
        );
      }
      const [{ count }] = await dataSource.query<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM appointments
          WHERE client_id = $1 AND status = 'no_show'`,
        [foreign],
      );
      expect(count).toBe(2);

      await unblock(randomUUID(), ownerToken).expect(404, CLIENT_NOT_FOUND);
      await unblock(foreign, ownerToken).expect(404, CLIENT_NOT_FOUND);

      expect(await resetAtOf(foreign)).toBeNull();
    });

    it('CA-22.2 (C8): a barber gets 403 and the client stays blocked', async () => {
      await blockJoao();

      await unblock(joao, brunoToken).expect(403, FORBIDDEN);

      expect(await profileOf(joao)).toMatchObject({
        noShowCount: 2,
        selfBookingBlocked: true,
      });
    });

    it('AC 9 (C9): answers 401 without a session', async () => {
      await unblock(joao).expect(401, UNAUTHORIZED);
    });

    it('AC 10 (C10): a suspended barbershop gets 402 and the client stays blocked', async () => {
      await blockJoao();
      await dataSource.query(
        'UPDATE barbershops SET trial_ends_at = $2 WHERE id = $1',
        [shopA, new Date('2026-10-01T00:00:00.000Z')],
      );

      await unblock(joao, ownerToken).expect(402, {
        message: SUSPENDED_WRITE,
      });

      expect(await profileOf(joao)).toMatchObject({
        noShowCount: 2,
        selfBookingBlocked: true,
      });
    });

    it('AC 11 (C11): documents the route with the US-22 summary, 204, 404 and owner-only access', () => {
      const operation =
        buildApiDocument(app).paths['/clients/{id}/unblock'].post!;

      expect(operation.summary).toContain('US-22');
      expect(operation).toMatchObject({ 'x-roles': ['owner'] });
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', in: 'path' }),
        ]),
      );
      expect(
        (operation.responses['204'] as ResponseObject).description,
      ).toEqual(expect.any(String));
      expect(JSON.stringify(operation.responses['404'])).toContain(
        CLIENT_NOT_FOUND.message,
      );
    });
  });

  describe('CA-12.x (C26): API docs', () => {
    it.each([
      ['/clients', ['200', '400', '401']],
      ['/clients/{id}', ['200', '400', '401', '404']],
    ])(
      'CA-12.1 (C26): documents %s with the US-12 summary, roles and responses',
      (path, statuses) => {
        const operation = buildApiDocument(app).paths[path].get!;

        expect(operation.summary).toContain('US-12');
        expect(operation).toMatchObject({ 'x-roles': ['owner', 'barber'] });
        expect(operation.description).toContain('**Acesso:** Dono, Barbeiro.');
        for (const status of statuses) {
          expect(
            (operation.responses[status] as ResponseObject).description,
          ).toEqual(expect.any(String));
        }
        expect(
          (operation.responses['200'] as ResponseObject).content,
        ).toBeDefined();
        if (path === '/clients/{id}') {
          expect(JSON.stringify(operation.responses['404'])).toContain(
            CLIENT_NOT_FOUND.message,
          );
        }
      },
    );
  });
});

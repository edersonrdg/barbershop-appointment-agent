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

const FORBIDDEN = { message: 'Acesso negado.' };
const UNAUTHORIZED = { message: 'Sessão inválida ou expirada.' };
const BARBER_NOT_FOUND = { message: 'Barbeiro não encontrado.' };
const SERVICE_NOT_FOUND = { message: 'Serviço não encontrado.' };
const CONFLICT = { message: 'O barbeiro já tem um agendamento nesse horário.' };

// Monday 2026-10-05, 09:00 in São Paulo (UTC-3): the barbershop opens now and
// the default minimum advance is 60 minutes.
const NOW = new Date('2026-10-05T12:00:00.000Z');
const MONDAY = '2026-10-05';
const ISO_MONDAY = 1;
const utc = (time: string) => `${MONDAY}T${time}:00.000Z`;

interface AppointmentBody {
  id: string;
  barber: { id: string; name: string };
  client: { id: string; name: string; phone: string } | null;
  services: { id: string; name: string }[];
  startsAt: string;
  endsAt: string;
  status: string;
  origin: string;
}

interface SlotsBody {
  date: string;
  timezone: string;
  slots: {
    barber: { id: string; name: string };
    startsAt: string;
    endsAt: string;
  }[];
}

describe('Manual booking (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;

  let shopA: string;
  let shopB: string;
  let ownerToken: string;
  let brunoToken: string;
  let noRecordToken: string;
  let ownerBToken: string;
  let ana: string;
  let bruno: string;
  let foreignBarber: string;
  let haircut: string;
  let beard: string;
  let foreignService: string;

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

  async function openMonday(barbershopId: string): Promise<void> {
    await dataSource.query(
      'DELETE FROM barbershop_opening_hours WHERE barbershop_id = $1',
      [barbershopId],
    );
    await dataSource.query(
      `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '09:00', '18:00')`,
      [barbershopId, ISO_MONDAY],
    );
  }

  async function insertService(
    barbershopId: string,
    name: string,
    durationMinutes: number,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, 4500, $4, true, now())`,
      [id, barbershopId, name, durationMinutes],
    );
    return id;
  }

  // A barber who performs the services and works 09:00-18:00 on monday.
  async function insertBarber(
    barbershopId: string,
    name: string,
    serviceIds: string[],
    userId: string | null = null,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, $4, true, now())`,
      [id, barbershopId, name, userId],
    );
    for (const [position, serviceId] of serviceIds.entries()) {
      await dataSource.query(
        `INSERT INTO barber_services (barber_id, service_id, barbershop_id, position)
         VALUES ($1, $2, $3, $4)`,
        [id, serviceId, barbershopId, position],
      );
    }
    await dataSource.query(
      `INSERT INTO barber_working_hours (barber_id, weekday, starts_at, ends_at)
       VALUES ($1, $2, '09:00', '18:00')`,
      [id, ISO_MONDAY],
    );
    return id;
  }

  async function insertClient(
    barbershopId: string,
    phone: string,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, 'Cliente', $3, $4)`,
      [id, barbershopId, phone, new Date(NOW.getTime() - 60 * 1000)],
    );
    return id;
  }

  async function count(table: string): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM ${table}`,
    );
    return Number(row.count);
  }

  async function clientRows() {
    return dataSource.query<
      { id: string; barbershop_id: string; name: string; phone: string }[]
    >('SELECT id, barbershop_id, name, phone FROM clients ORDER BY created_at');
  }

  function create(body: Record<string, unknown>, token?: string) {
    const call = request(app.getHttpServer()).post('/appointments').send(body);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function slots(query: Record<string, string>, token?: string) {
    const call = request(app.getHttpServer())
      .get('/appointments/available-slots')
      .query(query);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  const booking = (overrides: Record<string, unknown> = {}) => ({
    barberId: ana,
    serviceIds: [haircut, beard],
    startsAt: utc('13:00'),
    client: { name: 'João', phone: '11987654321' },
    ...overrides,
  });

  async function booked(
    overrides: Record<string, unknown> = {},
    token = ownerToken,
  ): Promise<AppointmentBody> {
    const response = await create(booking(overrides), token).expect(201);
    return response.body as AppointmentBody;
  }

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
    noRecordToken = await createBarber(
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
    await openMonday(shopA);
    await openMonday(shopB);
    haircut = await insertService(shopA, 'Corte', 30);
    beard = await insertService(shopA, 'Barba', 15);
    ana = await insertBarber(shopA, 'Ana', [haircut, beard]);
    bruno = await insertBarber(
      shopA,
      'Bruno',
      [haircut, beard],
      await userIdOf('bruno@a.com'),
    );
    foreignService = await insertService(shopB, 'Corte', 30);
    foreignBarber = await insertBarber(shopB, 'Davi', [foreignService]);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('CA-10.1: the owner books a manual appointment', () => {
    it('CA-10.1: answers 201 in the schedule format and the day schedule shows it with the client and origin manual', async () => {
      const response = await create(booking(), ownerToken).expect(201);

      const body = response.body as AppointmentBody;
      expect(body).toEqual({
        id: expect.any(String) as string,
        barber: { id: ana, name: 'Ana' },
        client: {
          id: expect.any(String) as string,
          name: 'João',
          phone: '+5511987654321',
        },
        services: [
          { id: haircut, name: 'Corte' },
          { id: beard, name: 'Barba' },
        ],
        startsAt: utc('13:00'),
        endsAt: utc('13:45'),
        status: 'confirmed',
        origin: 'manual',
        clientConfirmedAt: null,
      });

      const schedule = await request(app.getHttpServer())
        .get('/appointments')
        .query({ view: 'day', date: MONDAY })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(
        (schedule.body as { appointments: AppointmentBody[] }).appointments,
      ).toEqual([{ ...body, unconfirmed: false }]);
    });
  });

  describe('CA-10.2: the client is identified by the phone', () => {
    it('CA-10.2: a second booking with the same phone in another format and another name links the same client with the original name', async () => {
      const first = await booked({
        client: { name: '  João  ', phone: '11987654321' },
      });
      const second = await booked({
        startsAt: utc('15:00'),
        client: { name: 'Joao Silva', phone: '+55 (11) 98765-4321' },
      });

      expect(second.client).toEqual(first.client);
      expect(second.client).toMatchObject({
        name: 'João',
        phone: '+5511987654321',
      });
      expect(await clientRows()).toEqual([
        {
          id: first.client!.id,
          barbershop_id: shopA,
          name: 'João',
          phone: '+5511987654321',
        },
      ]);
    });

    it('CA-10.2: a booking refused for a conflict with a new phone leaves no new client', async () => {
      await booked({ client: { name: 'João', phone: '11987654321' } });

      await create(
        booking({
          startsAt: utc('13:30'),
          client: { name: 'Maria', phone: '21987654321' },
        }),
        ownerToken,
      ).expect(409, CONFLICT);

      expect((await clientRows()).map((row) => row.phone)).toEqual([
        '+5511987654321',
      ]);
      expect(await count('appointments')).toBe(1);
    });

    it('CA-10.2: two parallel bookings at different free times with the same new phone answer 201 and share one client', async () => {
      const [first, second] = await Promise.all([
        create(booking({ startsAt: utc('13:00') }), ownerToken),
        create(booking({ startsAt: utc('15:00') }), ownerToken),
      ]);

      expect([first.status, second.status]).toEqual([201, 201]);
      const clients = await clientRows();
      expect(clients).toHaveLength(1);
      expect((first.body as AppointmentBody).client?.id).toBe(clients[0].id);
      expect((second.body as AppointmentBody).client?.id).toBe(clients[0].id);
      expect(await count('appointments')).toBe(2);
    });
  });

  describe('CA-10.3: no minimum advance on the panel', () => {
    it('CA-10.3: the query returns starts from now and a start inside the minimum advance is booked (AGM-22, AGM-04, AGM-24)', async () => {
      const before = await slots(
        { date: MONDAY, serviceIds: haircut, barberId: ana },
        ownerToken,
      ).expect(200);
      const offered = before.body as SlotsBody;
      expect(offered.date).toBe(MONDAY);
      expect(offered.timezone).toBe('America/Sao_Paulo');
      expect(offered.slots[0]).toEqual({
        barber: { id: ana, name: 'Ana' },
        startsAt: utc('12:00'),
        endsAt: utc('12:30'),
      });

      const created = await booked({
        serviceIds: [haircut],
        startsAt: offered.slots[0].startsAt,
      });
      expect(created.startsAt).toBe(utc('12:00'));

      const after = await slots(
        { date: MONDAY, serviceIds: haircut, barberId: ana },
        ownerToken,
      ).expect(200);
      expect(
        (after.body as SlotsBody).slots.map((slot) => slot.startsAt),
      ).toEqual(
        offered.slots
          .map((slot) => slot.startsAt)
          .filter((start) => start !== utc('12:00')),
      );
    });

    it('CA-10.1: without a barber, the owner gets each start once with the first free barber by name (AGM-21)', async () => {
      await booked({ serviceIds: [haircut], startsAt: utc('12:00') });

      const response = await slots(
        { date: MONDAY, serviceIds: `${haircut},${beard}` },
        ownerToken,
      ).expect(200);

      const found = (response.body as SlotsBody).slots;
      expect(found.slice(0, 2)).toEqual([
        {
          barber: { id: bruno, name: 'Bruno' },
          startsAt: utc('12:00'),
          endsAt: utc('12:45'),
        },
        {
          barber: { id: ana, name: 'Ana' },
          startsAt: utc('12:30'),
          endsAt: utc('13:15'),
        },
      ]);
      const starts = found.map((slot) => slot.startsAt);
      expect(new Set(starts).size).toBe(starts.length);
    });
  });

  describe('CA-10.4: refusals name the rule', () => {
    it('CA-10.4: an overlapping booking answers 409 and saves nothing', async () => {
      await booked();

      await create(booking({ startsAt: utc('13:30') }), ownerToken).expect(
        409,
        CONFLICT,
      );
      expect(await count('appointments')).toBe(1);
    });

    it('CA-10.4: two overlapping bookings in parallel answer one 201 and one 409 (RN-07)', async () => {
      const responses = await Promise.all([
        create(
          booking({ client: { name: 'João', phone: '11987654321' } }),
          ownerToken,
        ),
        create(
          booking({
            startsAt: utc('13:15'),
            client: { name: 'Maria', phone: '21987654321' },
          }),
          ownerToken,
        ),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      const refused = responses.find((response) => response.status === 409);
      expect(refused?.body).toEqual(CONFLICT);
      expect(await count('appointments')).toBe(1);
      expect(await count('clients')).toBe(1);
    });

    it('CA-10.4: a booking past the closing time answers 422 with the rule', async () => {
      // 17:30-18:15 local ends after the 18:00 closing.
      await create(booking({ startsAt: utc('20:30') }), ownerToken).expect(
        422,
        { message: 'O horário está fora do funcionamento da barbearia.' },
      );
      expect(await count('appointments')).toBe(0);
      expect(await count('clients')).toBe(0);
    });

    it('CA-10.4: a start over a block answers 422 with the rule', async () => {
      await dataSource.query(
        `INSERT INTO barber_blocks (id, barbershop_id, barber_id, kind, starts_at, ends_at, created_at)
         VALUES ($1, $2, $3, 'block', $4, $5, now())`,
        [randomUUID(), shopA, ana, utc('18:00'), utc('19:00')],
      );

      await create(booking({ startsAt: utc('18:00') }), ownerToken).expect(
        422,
        { message: 'O barbeiro está indisponível nesse horário.' },
      );
      expect(await count('appointments')).toBe(0);
    });

    it('CA-10.4: an unknown service answers 404', async () => {
      await create(
        booking({ serviceIds: [haircut, randomUUID()] }),
        ownerToken,
      ).expect(404, SERVICE_NOT_FOUND);
      expect(await count('appointments')).toBe(0);
    });
  });

  describe('CA-10.5: a barber books and queries only their own schedule', () => {
    it('CA-10.5: Bruno books for himself (AGM-17)', async () => {
      const body = await booked({ barberId: bruno }, brunoToken);

      expect(body.barber).toEqual({ id: bruno, name: 'Bruno' });
      expect(body.origin).toBe('manual');
    });

    it('CA-10.5: Bruno booking for Ana answers 403 and saves no appointment nor client (AGM-18)', async () => {
      await create(booking({ barberId: ana }), brunoToken).expect(
        403,
        FORBIDDEN,
      );

      expect(await count('appointments')).toBe(0);
      expect(await count('clients')).toBe(0);
    });

    it('CA-10.5: a barber user without a barber record answers 403 and saves nothing (AGM-18)', async () => {
      await create(booking({ barberId: ana }), noRecordToken).expect(
        403,
        FORBIDDEN,
      );

      expect(await count('appointments')).toBe(0);
      expect(await count('clients')).toBe(0);
    });

    it('CA-10.5: Bruno querying Ana answers 403; without a barber he gets only his own starts (AGM-23)', async () => {
      await slots(
        { date: MONDAY, serviceIds: haircut, barberId: ana },
        brunoToken,
      ).expect(403, FORBIDDEN);

      const own = await slots(
        { date: MONDAY, serviceIds: haircut },
        brunoToken,
      ).expect(200);
      const found = (own.body as SlotsBody).slots;
      expect(found.length).toBeGreaterThan(0);
      expect(new Set(found.map((slot) => slot.barber.id))).toEqual(
        new Set([bruno]),
      );
    });
  });

  describe('AGM-16, AGM-25: validation', () => {
    it('AGM-16: a start without offset answers 400 with the message and saves nothing', async () => {
      await create(
        booking({ startsAt: '2026-10-05T10:00:00' }),
        ownerToken,
      ).expect(400, {
        message: 'Dados inválidos.',
        errors: [
          {
            field: 'startsAt',
            message: 'Informe o início em ISO 8601 com fuso, em minuto cheio.',
          },
        ],
      });
      expect(await count('appointments')).toBe(0);
      expect(await count('clients')).toBe(0);
    });

    it('AGM-25: a date that does not exist answers 400 with the message', async () => {
      await slots(
        { date: '2026-02-30', serviceIds: haircut },
        ownerToken,
      ).expect(400, {
        message: 'Dados inválidos.',
        errors: [
          {
            field: 'date',
            message: 'Informe uma data válida no formato AAAA-MM-DD.',
          },
        ],
      });
    });

    it('AGM-25: a repeated service in the query answers 400 with the message', async () => {
      await slots(
        { date: MONDAY, serviceIds: `${haircut},${haircut}` },
        ownerToken,
      ).expect(400, {
        message: 'Dados inválidos.',
        errors: [
          {
            field: 'serviceIds',
            message: 'Escolha cada serviço uma única vez.',
          },
        ],
      });
    });
  });

  describe('AGM-28: session', () => {
    it('AGM-28: both routes answer 401 without a token', async () => {
      await create(booking()).expect(401, UNAUTHORIZED);
      await slots({ date: MONDAY, serviceIds: haircut }).expect(
        401,
        UNAUTHORIZED,
      );
      expect(await count('appointments')).toBe(0);
    });
  });

  describe('RN-26: nothing crosses barbershops', () => {
    it('RN-26: a barber or service of another barbershop answers 404 and saves nothing', async () => {
      await create(booking({ barberId: foreignBarber }), ownerToken).expect(
        404,
        BARBER_NOT_FOUND,
      );
      await create(booking({ barberId: ana }), ownerBToken).expect(
        404,
        BARBER_NOT_FOUND,
      );
      await create(
        booking({ serviceIds: [foreignService] }),
        ownerToken,
      ).expect(404, SERVICE_NOT_FOUND);
      await slots(
        { date: MONDAY, serviceIds: haircut, barberId: ana },
        ownerBToken,
      ).expect(404, BARBER_NOT_FOUND);

      expect(await count('appointments')).toBe(0);
      expect(await count('clients')).toBe(0);
    });

    it('RN-26: a phone of a client of another barbershop creates a new client in the session barbershop (AGM-07)', async () => {
      const foreignClient = await insertClient(shopB, '+5511987654321');

      const body = await booked();

      expect(body.client?.id).not.toBe(foreignClient);
      expect(
        (await clientRows()).map((row) => [row.barbershop_id, row.phone]),
      ).toEqual([
        [shopB, '+5511987654321'],
        [shopA, '+5511987654321'],
      ]);
    });
  });

  describe('AGM-29: API docs', () => {
    it('AGM-29: documents both routes with summary, roles and every response', () => {
      const paths = buildApiDocument(app).paths;
      const operations = [
        {
          operation: paths['/appointments'].post!,
          statuses: ['201', '400', '401', '403', '404', '409', '422'],
        },
        {
          operation: paths['/appointments/available-slots'].get!,
          statuses: ['200', '400', '401', '403', '404'],
        },
      ];

      for (const { operation, statuses } of operations) {
        expect(operation.summary).toContain('US-10');
        expect(operation).toMatchObject({ 'x-roles': ['owner', 'barber'] });
        expect(operation.description).toContain('**Acesso:** Dono, Barbeiro.');
        expect(Object.keys(operation.responses).sort()).toEqual(
          [...statuses].sort(),
        );
        for (const status of statuses) {
          expect(
            (operation.responses[status] as ResponseObject).description,
          ).toEqual(expect.any(String));
        }
      }
      expect(paths['/appointments'].get!.summary).toContain('US-08');
    });
  });
});

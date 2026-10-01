import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ResponseObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { buildApiDocument } from '../src/infrastructure/http/api-docs/api-document';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { createBarber, signupOwner } from './support/account-flows';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const FORBIDDEN = { message: 'Acesso negado.' };
const UNAUTHORIZED = { message: 'Sessão inválida ou expirada.' };
const BARBER_NOT_FOUND = { message: 'Barbeiro não encontrado.' };

// Monday 2026-09-28 to Sunday 2026-10-04 in America/Sao_Paulo (UTC-3).
const MONDAY = '2026-09-28';
const WEDNESDAY = '2026-09-30';

interface ScheduleBody {
  view: string;
  startDate: string;
  endDate: string;
  timezone: string;
  appointments: { id: string }[];
}

describe('Schedule (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;

  let ownerToken: string;
  let brunoToken: string;
  let noRecordToken: string;
  let ownerBToken: string;
  let ana: string;
  let bruno: string;
  let foreignBarber: string;
  let haircut: string;
  let beard: string;
  let joao: string;
  let anaMonday: string;
  let brunoMonday: string;
  let brunoWednesday: string;
  let anaNextMonday: string;
  let foreignMonday: string;

  async function userByEmail(
    email: string,
  ): Promise<{ id: string; barbershopId: string }> {
    const [row] = await dataSource.query<
      { id: string; barbershop_id: string }[]
    >('SELECT id, barbershop_id FROM users WHERE email = $1', [email]);
    return { id: row.id, barbershopId: row.barbershop_id };
  }

  async function insertBarber(
    barbershopId: string,
    name: string,
    userId: string | null = null,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, $4, true, now())`,
      [id, barbershopId, name, userId],
    );
    return id;
  }

  async function insertService(
    barbershopId: string,
    name: string,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, 4500, 30, true, now())`,
      [id, barbershopId, name],
    );
    return id;
  }

  async function insertAppointment(row: {
    barbershopId: string;
    barberId: string;
    startsAt: string;
    endsAt: string;
    serviceIds: string[];
    clientId?: string;
    origin: 'bot' | 'manual';
  }): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, now())`,
      [
        id,
        row.barbershopId,
        row.barberId,
        row.clientId ?? null,
        row.startsAt,
        row.endsAt,
        row.origin,
      ],
    );
    for (const [position, serviceId] of row.serviceIds.entries()) {
      await dataSource.query(
        `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
         VALUES ($1, $2, $3, $4)`,
        [id, position, serviceId, row.barbershopId],
      );
    }
    return id;
  }

  function schedule(query: Record<string, string>, token?: string) {
    const call = request(app.getHttpServer()).get('/appointments').query(query);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  async function idsOf(
    query: Record<string, string>,
    token: string,
  ): Promise<string[]> {
    const response = await schedule(query, token).expect(200);
    return (response.body as ScheduleBody).appointments.map(({ id }) => id);
  }

  beforeAll(async () => {
    ({ app, dataSource, emailSender } = await createAccountTestApp());
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
    const { barbershopId: shopA } = await userByEmail('dono@a.com');
    const { barbershopId: shopB } = await userByEmail('dono@b.com');
    const brunoUser = await userByEmail('bruno@a.com');

    ana = await insertBarber(shopA, 'Ana');
    bruno = await insertBarber(shopA, 'Bruno', brunoUser.id);
    haircut = await insertService(shopA, 'Corte');
    beard = await insertService(shopA, 'Barba');
    joao = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, 'João', '+5511987654321', now())`,
      [joao, shopA],
    );
    anaMonday = await insertAppointment({
      barbershopId: shopA,
      barberId: ana,
      startsAt: '2026-09-28T13:00:00Z',
      endsAt: '2026-09-28T13:45:00Z',
      serviceIds: [haircut, beard],
      clientId: joao,
      origin: 'manual',
    });
    brunoMonday = await insertAppointment({
      barbershopId: shopA,
      barberId: bruno,
      startsAt: '2026-09-28T14:00:00Z',
      endsAt: '2026-09-28T14:30:00Z',
      serviceIds: [haircut],
      origin: 'manual',
    });
    brunoWednesday = await insertAppointment({
      barbershopId: shopA,
      barberId: bruno,
      startsAt: '2026-09-30T12:00:00Z',
      endsAt: '2026-09-30T12:30:00Z',
      serviceIds: [haircut],
      origin: 'bot',
    });
    anaNextMonday = await insertAppointment({
      barbershopId: shopA,
      barberId: ana,
      startsAt: '2026-10-05T13:00:00Z',
      endsAt: '2026-10-05T13:30:00Z',
      serviceIds: [haircut],
      origin: 'manual',
    });
    foreignBarber = await insertBarber(shopB, 'Ana');
    foreignMonday = await insertAppointment({
      barbershopId: shopB,
      barberId: foreignBarber,
      startsAt: '2026-09-28T13:00:00Z',
      endsAt: '2026-09-28T13:30:00Z',
      serviceIds: [await insertService(shopB, 'Corte')],
      origin: 'manual',
    });
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('CA-08.1: the owner sees every barber by day or week', () => {
    it('CA-08.1: day view returns every barber that day with the period and timezone', async () => {
      const response = await schedule(
        { view: 'day', date: MONDAY },
        ownerToken,
      ).expect(200);

      const body = response.body as ScheduleBody;
      expect(body).toMatchObject({
        view: 'day',
        startDate: MONDAY,
        endDate: MONDAY,
        timezone: 'America/Sao_Paulo',
      });
      expect(body.appointments.map(({ id }) => id)).toEqual([
        anaMonday,
        brunoMonday,
      ]);
    });

    it('CA-08.1: week view returns Monday to Sunday of the week of the date', async () => {
      const response = await schedule(
        { view: 'week', date: WEDNESDAY },
        ownerToken,
      ).expect(200);

      const body = response.body as ScheduleBody;
      expect(body).toMatchObject({
        view: 'week',
        startDate: MONDAY,
        endDate: '2026-10-04',
      });
      expect(body.appointments.map(({ id }) => id)).toEqual([
        anaMonday,
        brunoMonday,
        brunoWednesday,
      ]);
      expect(body.appointments.map(({ id }) => id)).not.toContain(
        anaNextMonday,
      );
    });

    it('CA-08.1: filters by one barber', async () => {
      expect(
        await idsOf(
          { view: 'week', date: MONDAY, barberId: bruno },
          ownerToken,
        ),
      ).toEqual([brunoMonday, brunoWednesday]);
    });

    it('CA-08.1: an empty period returns 200 with no appointments', async () => {
      expect(
        await idsOf({ view: 'day', date: '2026-09-29' }, ownerToken),
      ).toEqual([]);
    });

    it('CA-08.1: an unknown barber answers 404 "Barbeiro não encontrado."', async () => {
      await schedule(
        { view: 'day', date: MONDAY, barberId: randomUUID() },
        ownerToken,
      ).expect(404, BARBER_NOT_FOUND);
    });
  });

  describe('CA-08.2: a barber sees only their own appointments', () => {
    it('CA-08.2: without a filter returns only the barber linked to the user', async () => {
      expect(await idsOf({ view: 'week', date: MONDAY }, brunoToken)).toEqual([
        brunoMonday,
        brunoWednesday,
      ]);
    });

    it('CA-08.2: with their own barber id returns the same appointments', async () => {
      expect(
        await idsOf(
          { view: 'week', date: MONDAY, barberId: bruno },
          brunoToken,
        ),
      ).toEqual([brunoMonday, brunoWednesday]);
    });

    it('CA-08.2: asking for another barber answers 403 "Acesso negado."', async () => {
      await schedule(
        { view: 'week', date: MONDAY, barberId: ana },
        brunoToken,
      ).expect(403, FORBIDDEN);
    });

    it('CA-08.2: a barber user without a barber record gets an empty schedule', async () => {
      expect(
        await idsOf({ view: 'week', date: MONDAY }, noRecordToken),
      ).toEqual([]);
    });
  });

  describe('CA-08.3: each appointment shows client, services, time, status and origin', () => {
    it('CA-08.3: returns the full appointment with client and services in booked order', async () => {
      const response = await schedule(
        { view: 'day', date: MONDAY, barberId: ana },
        ownerToken,
      ).expect(200);

      expect((response.body as ScheduleBody).appointments).toEqual([
        {
          id: anaMonday,
          barber: { id: ana, name: 'Ana' },
          client: { id: joao, name: 'João', phone: '+5511987654321' },
          services: [
            { id: haircut, name: 'Corte' },
            { id: beard, name: 'Barba' },
          ],
          startsAt: '2026-09-28T13:00:00.000Z',
          endsAt: '2026-09-28T13:45:00.000Z',
          status: 'confirmed',
          origin: 'manual',
          clientConfirmedAt: null,
          unconfirmed: false,
        },
      ]);
    });

    it('CA-08.3: an appointment without client shows client null and the bot origin (RF-28)', async () => {
      const response = await schedule(
        { view: 'day', date: WEDNESDAY },
        brunoToken,
      ).expect(200);

      expect((response.body as ScheduleBody).appointments).toEqual([
        expect.objectContaining({
          id: brunoWednesday,
          client: null,
          origin: 'bot',
        }),
      ]);
    });
  });

  describe('RN-26 and access', () => {
    it('RN-26: each owner sees only their barbershop', async () => {
      expect(await idsOf({ view: 'day', date: MONDAY }, ownerBToken)).toEqual([
        foreignMonday,
      ]);
    });

    it('RN-26: a barber of another barbershop answers 404 "Barbeiro não encontrado."', async () => {
      await schedule(
        { view: 'day', date: MONDAY, barberId: foreignBarber },
        ownerToken,
      ).expect(404, BARBER_NOT_FOUND);
    });

    it('answers 401 without a session', async () => {
      await schedule({ view: 'day', date: MONDAY }).expect(401, UNAUTHORIZED);
    });

    it('AGD-24: answers 400 for an unknown view without reading the schedule', async () => {
      const response = await schedule(
        { view: 'month', date: MONDAY },
        ownerToken,
      ).expect(400);

      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [{ field: 'view', message: 'Escolha a visão: day ou week.' }],
      });
    });

    it('AGD-25: documents the route in Swagger with roles, query and responses', () => {
      const operation = buildApiDocument(app).paths['/appointments'].get!;

      expect(operation.summary).toContain('US-08');
      expect(operation).toMatchObject({ 'x-roles': ['owner', 'barber'] });
      expect(operation.description).toContain('**Acesso:** Dono, Barbeiro.');
      expect(
        (operation.parameters ?? []).map((parameter) =>
          'name' in parameter ? parameter.name : undefined,
        ),
      ).toEqual(['view', 'date', 'barberId']);
      for (const status of ['200', '400', '401', '403', '404']) {
        expect(
          (operation.responses[status] as ResponseObject | undefined)
            ?.description,
        ).toEqual(expect.any(String));
      }
    });
  });
});

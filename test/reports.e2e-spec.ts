import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
const DATE_MESSAGE = 'Informe uma data válida no formato AAAA-MM-DD.';
const ORDER_MESSAGE =
  'A data final deve ser igual ou posterior à data inicial.';
const MAX_DAYS_MESSAGE = 'O período pode ter no máximo 92 dias.';
const BARBER_MESSAGE = 'Informe um id de barbeiro válido.';

// 2026-10-05 is a monday in America/Sao_Paulo (UTC-3).
const SUNDAY = '2026-10-04';
const MONDAY = '2026-10-05';
const TUESDAY = '2026-10-06';
const ISO_MONDAY = 1;

const at = (time: string, date = MONDAY): string =>
  new Date(`${date}T${time}:00-03:00`).toISOString();

type Status = 'confirmed' | 'attended' | 'no_show' | 'cancelled';

interface ReportBody {
  from: string;
  to: string;
  barberId: string | null;
  totalAppointments: number;
  cancellations: number;
  noShows: number;
  occupancyPercent: number | null;
  estimatedRevenueCents: number;
  botBookedPercent: number | null;
}

interface ValidationBody {
  errors: { field: string; message: string }[];
}

describe('Reports (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;

  let ownerToken: string;
  let shopA: string;
  let shopB: string;
  let ana: string;
  let foreignBarber: string;
  let haircut: string;
  let beard: string;

  async function barbershopOf(email: string): Promise<string> {
    const [row] = await dataSource.query<{ barbershop_id: string }[]>(
      'SELECT barbershop_id FROM users WHERE email = $1',
      [email],
    );
    return row.barbershop_id;
  }

  async function openOnMonday(barbershopId: string): Promise<void> {
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

  async function insertBarber(
    barbershopId: string,
    name: string,
    hours: [string, string] | null,
    active = true,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, NULL, $4, now())`,
      [id, barbershopId, name, active],
    );
    if (hours) {
      await dataSource.query(
        `INSERT INTO barber_working_hours (barber_id, weekday, starts_at, ends_at)
         VALUES ($1, $2, $3, $4)`,
        [id, ISO_MONDAY, hours[0], hours[1]],
      );
    }
    return id;
  }

  async function insertService(
    barbershopId: string,
    name: string,
    priceCents: number,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, $4, 30, true, now())`,
      [id, barbershopId, name, priceCents],
    );
    return id;
  }

  async function insertAppointment(row: {
    start: string;
    end: string;
    status?: Status;
    origin?: 'bot' | 'manual';
    barberId?: string;
    barbershopId?: string;
    serviceIds?: string[];
  }): Promise<void> {
    const id = randomUUID();
    const barbershopId = row.barbershopId ?? shopA;
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, now())`,
      [
        id,
        barbershopId,
        row.barberId ?? ana,
        row.start,
        row.end,
        row.status ?? 'confirmed',
        row.origin ?? 'manual',
      ],
    );
    for (const [position, serviceId] of (
      row.serviceIds ?? [haircut]
    ).entries()) {
      await dataSource.query(
        `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
         VALUES ($1, $2, $3, $4)`,
        [id, position, serviceId, barbershopId],
      );
    }
  }

  async function insertBlock(
    barberId: string,
    start: string,
    end: string,
    barbershopId = shopA,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO barber_blocks (id, barbershop_id, barber_id, kind, starts_at, ends_at, created_at)
       VALUES ($1, $2, $3, 'block', $4, $5, now())`,
      [randomUUID(), barbershopId, barberId, start, end],
    );
  }

  function reports(query: Record<string, string>, token?: string) {
    const call = request(app.getHttpServer()).get('/reports').query(query);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  async function reportOf(
    query: Record<string, string> = {},
  ): Promise<ReportBody> {
    const response = await reports(
      { from: MONDAY, to: MONDAY, ...query },
      ownerToken,
    ).expect(200);
    return response.body as ReportBody;
  }

  async function errorsOf(
    query: Record<string, string>,
  ): Promise<ValidationBody['errors']> {
    const response = await reports(query, ownerToken).expect(400);
    return (response.body as ValidationBody).errors;
  }

  beforeAll(async () => {
    ({ app, dataSource, emailSender } = await createAccountTestApp());
    appWebUrl = app.get(ConfigService).getOrThrow<string>('APP_WEB_URL');
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    ({ accessToken: ownerToken } = await signupOwner(app, 'dono@a.com'));
    shopA = await barbershopOf('dono@a.com');
    await signupOwner(app, 'dono@b.com', 'Barbearia B');
    shopB = await barbershopOf('dono@b.com');
    await openOnMonday(shopA);
    await openOnMonday(shopB);
    ana = await insertBarber(shopA, 'Ana', ['09:00', '12:00']);
    haircut = await insertService(shopA, 'Corte', 4000);
    beard = await insertService(shopA, 'Barba', 2500);
    foreignBarber = await insertBarber(shopB, 'Carla', ['09:00', '18:00']);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('S1 - the owner sees the numbers of the period', () => {
    it('CA-26.1 (C1): counts every status of the appointments starting in the local period', async () => {
      await insertAppointment({ start: at('00:00'), end: at('00:30') });
      await insertAppointment({
        start: at('09:00'),
        end: at('09:30'),
        status: 'attended',
      });
      await insertAppointment({
        start: at('09:30'),
        end: at('10:00'),
        status: 'no_show',
      });
      await insertAppointment({
        start: at('10:00'),
        end: at('10:30'),
        status: 'cancelled',
      });
      await insertAppointment({ start: at('23:59', SUNDAY), end: at('00:00') });
      await insertAppointment({
        start: at('00:00', TUESDAY),
        end: at('00:30', TUESDAY),
      });

      const body = await reportOf();

      expect(body.totalAppointments).toBe(4);
      expect(body.from).toBe(MONDAY);
      expect(body.to).toBe(MONDAY);
      expect(body.barberId).toBeNull();
    });

    it('CA-26.1 (C2): counts the cancelled appointments', async () => {
      await insertAppointment({
        start: at('09:00'),
        end: at('09:30'),
        status: 'cancelled',
      });
      await insertAppointment({
        start: at('09:00'),
        end: at('09:30'),
        status: 'cancelled',
        origin: 'bot',
      });
      await insertAppointment({ start: at('09:00'), end: at('09:30') });

      expect((await reportOf()).cancellations).toBe(2);
    });

    it('CA-26.1 (C3): counts the no-shows', async () => {
      await insertAppointment({
        start: at('09:00'),
        end: at('09:30'),
        status: 'no_show',
      });
      await insertAppointment({
        start: at('09:30'),
        end: at('10:00'),
        status: 'no_show',
      });
      await insertAppointment({
        start: at('10:00'),
        end: at('10:30'),
        status: 'attended',
      });

      expect((await reportOf()).noShows).toBe(2);
    });

    it('CA-26.1 (C4): sums the current price of every service of the attended appointments', async () => {
      await insertAppointment({
        start: at('09:00'),
        end: at('10:00'),
        status: 'attended',
        serviceIds: [haircut, beard],
      });
      await insertAppointment({
        start: at('10:00'),
        end: at('10:30'),
        status: 'attended',
      });
      for (const [status, start, end] of [
        ['confirmed', '10:30', '11:30'],
        ['no_show', '11:30', '12:30'],
        ['cancelled', '09:00', '10:00'],
      ] as const) {
        await insertAppointment({
          start: at(start),
          end: at(end),
          status,
          serviceIds: [haircut, beard],
        });
      }

      expect((await reportOf()).estimatedRevenueCents).toBe(10500);

      await dataSource.query(
        'UPDATE services SET price_cents = 5000 WHERE id = $1',
        [haircut],
      );

      expect((await reportOf()).estimatedRevenueCents).toBe(12500);
    });

    describe('occupancy', () => {
      it('CA-26.1 (C5): booked minutes of confirmed, attended and no-show over the available minutes', async () => {
        await insertAppointment({
          start: at('09:00'),
          end: at('09:30'),
          status: 'attended',
        });
        await insertAppointment({
          start: at('09:30'),
          end: at('10:00'),
          status: 'no_show',
        });
        await insertAppointment({ start: at('10:00'), end: at('10:30') });
        await insertAppointment({
          start: at('10:30'),
          end: at('11:00'),
          status: 'cancelled',
        });

        expect((await reportOf()).occupancyPercent).toBe(50);
      });

      it('CA-26.1 (C5): a block reduces the available minutes', async () => {
        await insertBlock(ana, at('09:00'), at('10:00'));
        await insertAppointment({ start: at('10:00'), end: at('10:30') });
        await insertAppointment({ start: at('10:30'), end: at('11:00') });
        await insertAppointment({ start: at('11:00'), end: at('11:30') });

        expect((await reportOf()).occupancyPercent).toBe(75);
      });

      it('CA-26.1 (C5): only the part of an appointment inside the working hours counts', async () => {
        await insertAppointment({ start: at('11:30'), end: at('12:30') });

        expect((await reportOf()).occupancyPercent).toBe(16.7);
      });

      it('CA-26.1 (C5): an inactive barber stays out of the occupancy', async () => {
        const bruno = await insertBarber(
          shopA,
          'Bruno',
          ['09:00', '12:00'],
          false,
        );
        await insertAppointment({ start: at('09:00'), end: at('10:30') });
        await insertAppointment({
          barberId: bruno,
          start: at('09:00'),
          end: at('12:00'),
        });

        const body = await reportOf();

        expect(body.occupancyPercent).toBe(50);
        expect(body.totalAppointments).toBe(2);
      });

      it('CA-26.1 (C5): rounds to one decimal place', async () => {
        await insertAppointment({ start: at('09:00'), end: at('10:00') });
        expect((await reportOf()).occupancyPercent).toBe(33.3);

        await insertAppointment({ start: at('10:00'), end: at('11:00') });
        expect((await reportOf()).occupancyPercent).toBe(66.7);
      });

      it('CA-26.1 (C5): working hours count only inside the opening hours', async () => {
        await dataSource.query(
          `UPDATE barber_working_hours SET starts_at = '08:00' WHERE barber_id = $1`,
          [ana],
        );
        await insertAppointment({ start: at('09:00'), end: at('10:30') });

        expect((await reportOf()).occupancyPercent).toBe(50);
      });

      it('CA-26.1 (C6): is null for a period with no available minutes', async () => {
        const body = await reportOf({ from: SUNDAY, to: SUNDAY });

        expect(body.occupancyPercent).toBeNull();
      });

      it('CA-26.1 (C6): is null for an inactive barber, who still has the other numbers', async () => {
        const bruno = await insertBarber(
          shopA,
          'Bruno',
          ['09:00', '12:00'],
          false,
        );
        await insertAppointment({
          barberId: bruno,
          start: at('09:00'),
          end: at('10:00'),
        });

        const body = await reportOf({ barberId: bruno });

        expect(body.occupancyPercent).toBeNull();
        expect(body.totalAppointments).toBe(1);
      });
    });

    it('CA-26.1 (C7): with barberId, every number is of that barber only', async () => {
      const bruno = await insertBarber(shopA, 'Bruno', ['09:00', '18:00']);
      await insertBlock(bruno, at('13:00'), at('18:00'));
      await insertAppointment({
        start: at('09:00'),
        end: at('10:30'),
        status: 'attended',
      });
      await insertAppointment({
        start: at('11:00'),
        end: at('11:30'),
        status: 'cancelled',
      });
      await insertAppointment({
        barberId: bruno,
        start: at('09:00'),
        end: at('09:30'),
        status: 'no_show',
        origin: 'bot',
      });

      expect(await reportOf({ barberId: ana })).toEqual({
        from: MONDAY,
        to: MONDAY,
        barberId: ana,
        totalAppointments: 2,
        cancellations: 1,
        noShows: 0,
        occupancyPercent: 50,
        estimatedRevenueCents: 4000,
        botBookedPercent: 0,
      });
      expect(await reportOf()).toEqual({
        from: MONDAY,
        to: MONDAY,
        barberId: null,
        totalAppointments: 3,
        cancellations: 1,
        noShows: 1,
        // Ana 90 of 180 min, Bruno 30 of 240 min.
        occupancyPercent: 28.6,
        estimatedRevenueCents: 4000,
        botBookedPercent: 33.3,
      });
    });

    it('CA-26.1 (C8): appointments, hours and blocks of another barbershop change nothing (RN-26)', async () => {
      await insertAppointment({
        start: at('09:00'),
        end: at('10:30'),
        status: 'attended',
      });
      const before = await reportOf();
      const foreignService = await insertService(shopB, 'Corte', 9000);
      await insertBlock(foreignBarber, at('15:00'), at('16:00'), shopB);
      for (const [status, start, end] of [
        ['attended', '09:00', '10:00'],
        ['no_show', '10:00', '11:00'],
        ['cancelled', '11:00', '12:00'],
      ] as const) {
        await insertAppointment({
          barbershopId: shopB,
          barberId: foreignBarber,
          start: at(start),
          end: at(end),
          status,
          origin: 'bot',
          serviceIds: [foreignService],
        });
      }

      expect(await reportOf()).toEqual(before);
      expect(before).toMatchObject({
        totalAppointments: 1,
        occupancyPercent: 50,
        estimatedRevenueCents: 4000,
      });
    });

    it.each([
      [{ to: MONDAY }, 'from'],
      [{ from: MONDAY }, 'to'],
      [{ from: '05/10/2026', to: MONDAY }, 'from'],
      [{ from: MONDAY, to: '2026-02-30' }, 'to'],
    ])(
      'CA-26.1 (C9): rejects %p with the date message',
      async (query, field) => {
        expect(await errorsOf(query)).toEqual([
          { field, message: DATE_MESSAGE },
        ]);
      },
    );

    it('CA-26.1 (C10): rejects a to before from and accepts a single day', async () => {
      expect(await errorsOf({ from: MONDAY, to: SUNDAY })).toEqual([
        { field: 'to', message: ORDER_MESSAGE },
      ]);
      await reports({ from: MONDAY, to: MONDAY }, ownerToken).expect(200);
    });

    it('CA-26.1 (C11): accepts 92 days and rejects 93', async () => {
      await reports(
        { from: '2026-01-01', to: '2026-04-02' },
        ownerToken,
      ).expect(200);
      expect(await errorsOf({ from: '2026-01-01', to: '2026-04-03' })).toEqual([
        { field: 'to', message: MAX_DAYS_MESSAGE },
      ]);
    });

    it('CA-26.1 (C12): rejects a barberId that is not a UUID', async () => {
      expect(
        await errorsOf({ from: MONDAY, to: MONDAY, barberId: 'abc' }),
      ).toEqual([{ field: 'barberId', message: BARBER_MESSAGE }]);
    });

    it.each([
      ['a missing barber', () => randomUUID()],
      ['a barber of another barbershop', () => foreignBarber],
    ])('CA-26.1 (C13): answers 404 for %s', async (_, barberId) => {
      const response = await reports(
        { from: MONDAY, to: MONDAY, barberId: barberId() },
        ownerToken,
      ).expect(404);

      expect(response.body).toEqual(BARBER_NOT_FOUND);
    });
  });

  describe('S2 - the owner sees how much the bot books', () => {
    it('CA-26.2 (C14): the share of appointments booked by the bot', async () => {
      await insertAppointment({
        start: at('09:00'),
        end: at('09:30'),
        origin: 'bot',
      });
      await insertAppointment({
        start: at('09:30'),
        end: at('10:00'),
        origin: 'bot',
      });
      await insertAppointment({
        start: at('10:00'),
        end: at('10:30'),
        origin: 'bot',
        status: 'cancelled',
      });
      await insertAppointment({ start: at('10:30'), end: at('11:00') });

      expect((await reportOf()).botBookedPercent).toBe(75);
    });

    it('CA-26.2 (C14): rounds the bot share to one decimal place', async () => {
      await insertAppointment({
        start: at('09:00'),
        end: at('09:30'),
        origin: 'bot',
      });
      await insertAppointment({ start: at('09:30'), end: at('10:00') });
      await insertAppointment({ start: at('10:00'), end: at('10:30') });

      expect((await reportOf()).botBookedPercent).toBe(33.3);
    });

    it('CA-26.2 (C15): a period with no appointments has zeros and no bot share', async () => {
      expect(await reportOf({ from: TUESDAY, to: TUESDAY })).toEqual({
        from: TUESDAY,
        to: TUESDAY,
        barberId: null,
        totalAppointments: 0,
        cancellations: 0,
        noShows: 0,
        occupancyPercent: null,
        estimatedRevenueCents: 0,
        botBookedPercent: null,
      });
    });
  });

  describe('S3 - only the owner sees reports', () => {
    it('CA-26.3 (C16): denies a barber', async () => {
      const barberToken = await createBarber(
        app,
        emailSender,
        appWebUrl,
        ownerToken,
        'ana@a.com',
        'Ana',
      );

      const response = await reports(
        { from: MONDAY, to: MONDAY },
        barberToken,
      ).expect(403);

      expect(response.body).toEqual(FORBIDDEN);
    });

    it('CA-26.3 (C17): requires a session', async () => {
      const response = await reports({ from: MONDAY, to: MONDAY }).expect(401);

      expect(response.body).toEqual(UNAUTHORIZED);
    });

    it('CA-26.3 (C18): still answers the owner while the barbershop is suspended (AD-017)', async () => {
      await dataSource.query(
        `UPDATE barbershops SET trial_ends_at = now() - interval '1 day' WHERE id = $1`,
        [shopA],
      );
      await request(app.getHttpServer())
        .post('/settings/services')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(402);
      await insertAppointment({
        start: at('09:00'),
        end: at('10:30'),
        status: 'attended',
      });

      expect(await reportOf()).toMatchObject({
        totalAppointments: 1,
        occupancyPercent: 50,
        estimatedRevenueCents: 4000,
      });
    });

    it('CA-26.3 (C19): documents the route with the US-26 summary, query, 200, 404 and owner-only access', () => {
      const operation = buildApiDocument(app).paths['/reports'].get!;

      expect(operation.summary).toContain('US-26');
      expect(operation).toMatchObject({ 'x-roles': ['owner'] });
      for (const name of ['from', 'to', 'barberId']) {
        expect(operation.parameters).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name, in: 'query' }),
          ]),
        );
      }
      const success = JSON.stringify(operation.responses['200']);
      for (const property of [
        'totalAppointments',
        'cancellations',
        'noShows',
        'occupancyPercent',
        'estimatedRevenueCents',
        'botBookedPercent',
      ]) {
        expect(success).toContain(property);
      }
      expect(JSON.stringify(operation.responses['404'])).toContain(
        BARBER_NOT_FOUND.message,
      );
    });
  });
});

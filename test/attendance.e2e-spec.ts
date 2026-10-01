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

const FORBIDDEN = { message: 'Acesso negado.' };
const UNAUTHORIZED = { message: 'Sessão inválida ou expirada.' };
const NOT_FOUND = { message: 'Agendamento não encontrado.' };
const NOT_STARTED = { message: 'O agendamento ainda não começou.' };

// Monday 2026-10-05, 10:05 in São Paulo (UTC-3). Ana's appointment with Maria
// started at 10:00 (13:00Z).
const NOW = new Date('2026-10-05T13:05:00.000Z');
const MONDAY = '2026-10-05';
const LAST_MONDAY = '2026-09-28';
const ISO_MONDAY = 1;
const MARIA_PHONE = '+5511987654321';
const utc = (time: string, date = MONDAY) => `${date}T${time}:00.000Z`;

const RULES = {
  minimumAdvanceMinutes: 60,
  cancellationDeadlineMinutes: 120,
  noShowLimit: 2,
  waitlistOfferMinutes: 15,
  returnReminderDays: 30,
};

interface AttendanceBody {
  appointment: {
    id: string;
    barber: { id: string; name: string };
    client: { id: string; name: string; phone: string } | null;
    services: { id: string; name: string }[];
    startsAt: string;
    endsAt: string;
    status: string;
    origin: string;
  };
  client: {
    id: string;
    noShowCount: number;
    selfBookingBlocked: boolean;
  } | null;
}

describe('Attendance (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;

  let shopA: string;
  let ownerToken: string;
  let brunoToken: string;
  let noRecordToken: string;
  let ownerBToken: string;
  let ana: string;
  let bruno: string;
  let haircut: string;
  let maria: string;
  let today: string;

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
      [id, ISO_MONDAY],
    );
    return id;
  }

  async function insertAppointment({
    startsAt,
    barberId = ana,
    clientId = maria,
    status = 'confirmed',
    minutes = 30,
  }: {
    startsAt: string;
    barberId?: string;
    clientId?: string | null;
    status?: string;
    minutes?: number;
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
        new Date(start.getTime() + minutes * 60 * 1000),
        status,
      ],
    );
    await dataSource.query(
      `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
       VALUES ($1, 0, $2, $3)`,
      [id, haircut, shopA],
    );
    return id;
  }

  async function statusOf(appointmentId: string): Promise<string> {
    const [row] = await dataSource.query<{ status: string }[]>(
      'SELECT status FROM appointments WHERE id = $1',
      [appointmentId],
    );
    return row.status;
  }

  function mark(id: string, body: unknown, token?: string) {
    const call = request(app.getHttpServer())
      .patch(`/appointments/${id}/status`)
      .send(body as object);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  async function marked(
    id: string,
    status: string,
    token = ownerToken,
  ): Promise<AttendanceBody> {
    const response = await mark(id, { status }, token).expect(200);
    return response.body as AttendanceBody;
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
    await dataSource.query(
      `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '09:00', '18:00')`,
      [shopA, ISO_MONDAY],
    );
    haircut = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, 'Corte', 4500, 30, true, now())`,
      [haircut, shopA],
    );
    ana = await insertBarber('Ana');
    bruno = await insertBarber('Bruno', await userIdOf('bruno@a.com'));
    maria = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, 'Maria', $3, now())`,
      [maria, shopA, MARIA_PHONE],
    );
    today = await insertAppointment({ startsAt: utc('13:00') });
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('CA-11.1: marking attended or no-show', () => {
    it('CA-11.1: marks a started appointment as attended, answers 200 in the schedule format and the day schedule shows it (ATD-01, ATD-03)', async () => {
      const body = await marked(today, 'attended');

      expect(body).toEqual({
        appointment: {
          id: today,
          barber: { id: ana, name: 'Ana' },
          client: { id: maria, name: 'Maria', phone: MARIA_PHONE },
          services: [{ id: haircut, name: 'Corte' }],
          startsAt: utc('13:00'),
          endsAt: utc('13:30'),
          status: 'attended',
          origin: 'manual',
        },
        client: { id: maria, noShowCount: 0, selfBookingBlocked: false },
      });
      expect(await statusOf(today)).toBe('attended');
      const schedule = await request(app.getHttpServer())
        .get('/appointments')
        .query({ view: 'day', date: MONDAY })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(
        (schedule.body as { appointments: { id: string; status: string }[] })
          .appointments,
      ).toEqual([expect.objectContaining({ id: today, status: 'attended' })]);
    });

    it('CA-11.1: the day schedule shows a no-show (ATD-03)', async () => {
      await marked(today, 'no_show');

      const schedule = await request(app.getHttpServer())
        .get('/appointments')
        .query({ view: 'day', date: MONDAY })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(
        (schedule.body as { appointments: { id: string; status: string }[] })
          .appointments,
      ).toEqual([expect.objectContaining({ id: today, status: 'no_show' })]);
    });

    it('CA-11.1: an appointment that has not started answers 422 with the message and stays confirmed (ATD-02)', async () => {
      const later = await insertAppointment({ startsAt: utc('14:00') });

      await mark(later, { status: 'no_show' }, ownerToken).expect(
        422,
        NOT_STARTED,
      );

      expect(await statusOf(later)).toBe('confirmed');
    });

    it('CA-11.1: an appointment without a client is marked and answers client null (ATD-06)', async () => {
      const walkIn = await insertAppointment({
        startsAt: utc('12:00'),
        clientId: null,
      });

      const body = await marked(walkIn, 'no_show');

      expect(body.client).toBeNull();
      expect(body.appointment.status).toBe('no_show');
      expect(await statusOf(walkIn)).toBe('no_show');
    });

    it('RN-03: a no-show keeps holding the rest of its slot, so the engine does not offer it (ATD-04)', async () => {
      // Bruno's 10:00-11:00 (local) appointment is still running at 10:05; the
      // panel offers starts from now, so only the held slot keeps 10:30 out.
      const running = await insertAppointment({
        startsAt: utc('13:00'),
        barberId: bruno,
        minutes: 60,
      });
      await marked(running, 'no_show');

      const response = await request(app.getHttpServer())
        .get('/appointments/available-slots')
        .query({ date: MONDAY, serviceIds: haircut, barberId: bruno })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const starts = (
        response.body as { slots: { startsAt: string }[] }
      ).slots.map((slot) => slot.startsAt);
      expect(starts[0]).toBe(utc('14:00'));
    });
  });

  describe('CA-11.2: no-show counter and self-booking block', () => {
    it('CA-11.2: with 1 no-show and limit 2, a new no-show answers noShowCount 2 and selfBookingBlocked true (ATD-07, ATD-08, ATD-09)', async () => {
      await insertAppointment({
        startsAt: utc('13:00', LAST_MONDAY),
        status: 'no_show',
      });

      const body = await marked(today, 'no_show');

      expect(body.client).toEqual({
        id: maria,
        noShowCount: 2,
        selfBookingBlocked: true,
      });
    });

    it('CA-11.2: raising the no-show limit to 3 unblocks the client (ATD-10)', async () => {
      await insertAppointment({
        startsAt: utc('13:00', LAST_MONDAY),
        status: 'no_show',
      });
      await marked(today, 'no_show');
      await request(app.getHttpServer())
        .put('/settings/rules')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...RULES, noShowLimit: 3 })
        .expect(200);

      const body = await marked(today, 'no_show');

      expect(body.client).toEqual({
        id: maria,
        noShowCount: 2,
        selfBookingBlocked: false,
      });
    });

    it('RN-12: the owner still books a blocked client manually (ATD-11)', async () => {
      await insertAppointment({
        startsAt: utc('13:00', LAST_MONDAY),
        status: 'no_show',
      });
      expect((await marked(today, 'no_show')).client?.selfBookingBlocked).toBe(
        true,
      );

      const response = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          barberId: ana,
          serviceIds: [haircut],
          startsAt: utc('15:00'),
          client: { name: 'Maria', phone: '11987654321' },
        })
        .expect(201);

      expect((response.body as AttendanceBody['appointment']).client?.id).toBe(
        maria,
      );
    });

    it('RN-12: a barber still books a blocked client manually for themselves (ATD-11)', async () => {
      await insertAppointment({
        startsAt: utc('13:00', LAST_MONDAY),
        status: 'no_show',
      });
      expect((await marked(today, 'no_show')).client?.selfBookingBlocked).toBe(
        true,
      );

      const response = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${brunoToken}`)
        .send({
          barberId: bruno,
          serviceIds: [haircut],
          startsAt: utc('15:00'),
          client: { name: 'Maria', phone: '11987654321' },
        })
        .expect(201);

      const booked = response.body as AttendanceBody['appointment'];
      expect(booked.client?.id).toBe(maria);
      expect(booked.barber.id).toBe(bruno);
    });
  });

  describe('CA-11.4: correcting a mark', () => {
    it('CA-11.4: correcting a no-show to attended with 2 no-shows and limit 2 answers noShowCount 1 and unblocks (ATD-13)', async () => {
      await insertAppointment({
        startsAt: utc('13:00', LAST_MONDAY),
        status: 'no_show',
      });
      await marked(today, 'no_show');

      const body = await marked(today, 'attended');

      expect(body.client).toEqual({
        id: maria,
        noShowCount: 1,
        selfBookingBlocked: false,
      });
      expect(await statusOf(today)).toBe('attended');
    });

    it('CA-11.4: correcting attended to no-show adds 1 (ATD-14)', async () => {
      await marked(today, 'attended');

      const body = await marked(today, 'no_show');

      expect(body.client?.noShowCount).toBe(1);
    });

    it('CA-11.4: two concurrent marks end with one of the sent statuses and a matching counter (ATD-16)', async () => {
      await Promise.all([
        mark(today, { status: 'no_show' }, ownerToken).expect(200),
        mark(today, { status: 'attended' }, ownerToken).expect(200),
      ]);

      const final = await statusOf(today);
      const body = await marked(today, final);
      expect(['attended', 'no_show']).toContain(final);
      expect(body.client?.noShowCount).toBe(final === 'no_show' ? 1 : 0);
    });
  });

  describe('ATD-17: validation', () => {
    it('ATD-17: an id that is not a UUID answers 400 with the message', async () => {
      await mark('not-a-uuid', { status: 'attended' }, ownerToken).expect(400, {
        message: 'Dados inválidos.',
        errors: [
          { field: 'id', message: 'Informe um id de agendamento válido.' },
        ],
      });
    });

    it.each(['confirmed', 'cancelled', undefined])(
      'ATD-17: the status %p answers 400 with the message and changes nothing',
      async (status) => {
        await mark(today, { status }, ownerToken).expect(400, {
          message: 'Dados inválidos.',
          errors: [
            {
              field: 'status',
              message: 'Informe o status: attended ou no_show.',
            },
          ],
        });
        expect(await statusOf(today)).toBe('confirmed');
      },
    );
  });

  describe('Seção 5 and RN-26: access', () => {
    it('ATD-21: answers 401 without a session and changes nothing', async () => {
      await mark(today, { status: 'no_show' }).expect(401, UNAUTHORIZED);
      expect(await statusOf(today)).toBe('confirmed');
    });

    it('ATD-19: a barber marks an appointment of the barber linked to them', async () => {
      const own = await insertAppointment({
        startsAt: utc('13:00'),
        barberId: bruno,
      });

      const body = await marked(own, 'no_show', brunoToken);

      expect(body.appointment).toMatchObject({
        id: own,
        barber: { id: bruno, name: 'Bruno' },
        status: 'no_show',
      });
      expect(await statusOf(own)).toBe('no_show');
    });

    it('ATD-20: a barber marking another barber, or without a barber record, answers 403 and changes nothing', async () => {
      await mark(today, { status: 'no_show' }, brunoToken).expect(
        403,
        FORBIDDEN,
      );
      await mark(today, { status: 'no_show' }, noRecordToken).expect(
        403,
        FORBIDDEN,
      );

      expect(await statusOf(today)).toBe('confirmed');
    });

    it('ATD-18: an appointment of another barbershop, or unknown, answers 404 and changes nothing', async () => {
      await mark(today, { status: 'no_show' }, ownerBToken).expect(
        404,
        NOT_FOUND,
      );
      await mark(randomUUID(), { status: 'no_show' }, ownerToken).expect(
        404,
        NOT_FOUND,
      );

      expect(await statusOf(today)).toBe('confirmed');
    });
  });

  describe('ATD-22: API docs', () => {
    it('ATD-22: documents the route with the US-11 summary, payload, roles and every response', () => {
      const operation =
        buildApiDocument(app).paths['/appointments/{id}/status'].patch!;
      const statuses = ['200', '400', '401', '403', '404', '409', '422'];

      expect(operation.summary).toContain('US-11');
      expect(operation.requestBody).toBeDefined();
      expect(operation).toMatchObject({ 'x-roles': ['owner', 'barber'] });
      expect(operation.description).toContain('**Acesso:** Dono, Barbeiro.');
      expect(Object.keys(operation.responses).sort()).toEqual(statuses);
      for (const status of statuses) {
        expect(
          (operation.responses[status] as ResponseObject).description,
        ).toEqual(expect.any(String));
      }
    });
  });

  describe('US-18', () => {
    it('AC 24 (C29): marking a cancelled appointment answers 409 and changes nothing', async () => {
      const cancelled = await insertAppointment({
        startsAt: utc('12:00'),
        status: 'cancelled',
      });

      await mark(cancelled, { status: 'attended' }, ownerToken).expect(409, {
        message: 'Esse agendamento foi cancelado.',
      });
      expect(await statusOf(cancelled)).toBe('cancelled');
    });
  });
});

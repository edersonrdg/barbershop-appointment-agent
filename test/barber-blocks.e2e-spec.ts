import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ResponseObject, SchemaObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BarberUnavailableError } from '../src/domain/errors/barber-unavailable.error';
import { buildApiDocument } from '../src/infrastructure/http/api-docs/api-document';
import { BookAppointmentUseCase } from '../src/usecases/book-appointment/book-appointment.use-case';
import { ListAvailableSlotsUseCase } from '../src/usecases/list-available-slots/list-available-slots.use-case';
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
const BLOCK_NOT_FOUND = { message: 'Bloqueio não encontrado.' };
const CONFLICT_MESSAGE = 'O bloqueio conflita com agendamentos existentes.';

// Monday 2026-09-28 in São Paulo (UTC-3); the blocks are later that week:
// thursday 2026-10-01 and friday 2026-10-02.
const NOW = new Date('2026-09-28T12:00:00.000Z');
const THURSDAY = '2026-10-01';
const FRIDAY = '2026-10-02';
const SUNDAY = '2026-10-04';
const ISO_THURSDAY = 4;
const ISO_FRIDAY = 5;

interface BlockBody {
  id: string;
  barber: { id: string; name: string };
  kind: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

interface CreatedBody {
  block: BlockBody;
  affectedAppointments: { id: string }[];
}

interface ListBody {
  view: string;
  startDate: string;
  endDate: string;
  timezone: string;
  blocks: BlockBody[];
}

interface Slot {
  barberId: string;
  startsAt: Date;
  endsAt: Date;
}

describe('Barber blocks (e2e)', () => {
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

  async function openThursdayAndFriday(barbershopId: string): Promise<void> {
    await dataSource.query(
      'DELETE FROM barbershop_opening_hours WHERE barbershop_id = $1',
      [barbershopId],
    );
    for (const weekday of [ISO_THURSDAY, ISO_FRIDAY]) {
      await dataSource.query(
        `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at)
         VALUES ($1, $2, '09:00', '18:00')`,
        [barbershopId, weekday],
      );
    }
  }

  async function insertService(barbershopId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, 'Corte', 4500, 30, true, now())`,
      [id, barbershopId],
    );
    return id;
  }

  // A barber who performs the service and works 09:00-18:00 on thursday and
  // friday.
  async function insertBarber(
    barbershopId: string,
    name: string,
    serviceId: string,
    userId: string | null = null,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, $4, true, now())`,
      [id, barbershopId, name, userId],
    );
    await dataSource.query(
      `INSERT INTO barber_services (barber_id, service_id, barbershop_id, position)
       VALUES ($1, $2, $3, 0)`,
      [id, serviceId, barbershopId],
    );
    for (const weekday of [ISO_THURSDAY, ISO_FRIDAY]) {
      await dataSource.query(
        `INSERT INTO barber_working_hours (barber_id, weekday, starts_at, ends_at)
         VALUES ($1, $2, '09:00', '18:00')`,
        [id, weekday],
      );
    }
    return id;
  }

  async function insertAppointment(
    barberId: string,
    startsAt: string,
    endsAt: string,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, NULL, $4, $5, 'confirmed', 'manual', now())`,
      [id, shopA, barberId, startsAt, endsAt],
    );
    await dataSource.query(
      `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
       VALUES ($1, 0, $2, $3)`,
      [id, haircut, shopA],
    );
    return id;
  }

  async function appointmentRow(id: string) {
    const [row] = await dataSource.query<
      { status: string; starts_at: Date; ends_at: Date }[]
    >('SELECT status, starts_at, ends_at FROM appointments WHERE id = $1', [
      id,
    ]);
    return row;
  }

  async function blockRows() {
    return dataSource.query<
      {
        id: string;
        barbershop_id: string;
        barber_id: string;
        kind: string;
        starts_at: Date;
        ends_at: Date;
        reason: string | null;
      }[]
    >(
      'SELECT id, barbershop_id, barber_id, kind, starts_at, ends_at, reason FROM barber_blocks ORDER BY starts_at',
    );
  }

  function createBlock(body: Record<string, unknown>, token?: string) {
    const call = request(app.getHttpServer()).post('/blocks').send(body);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function listBlocks(query: Record<string, string>, token?: string) {
    const call = request(app.getHttpServer()).get('/blocks').query(query);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function removeBlock(blockId: string, token?: string) {
    const call = request(app.getHttpServer()).delete(`/blocks/${blockId}`);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  async function created(
    body: Record<string, unknown>,
    token: string,
  ): Promise<CreatedBody> {
    const response = await createBlock(body, token).expect(201);
    return response.body as CreatedBody;
  }

  function slots(barberId: string, date: string): Promise<Slot[]> {
    return app.get(ListAvailableSlotsUseCase).execute({
      barbershopId: shopA,
      barberId,
      serviceIds: [haircut],
      date,
      origin: 'manual',
    });
  }

  const startsOf = (list: Slot[]) =>
    list.map((slot) => slot.startsAt.toISOString());

  const lunch = (barberId: string) => ({
    kind: 'block',
    barberId,
    date: THURSDAY,
    start: '12:00',
    end: '13:00',
  });

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
    await openThursdayAndFriday(shopA);
    haircut = await insertService(shopA);
    ana = await insertBarber(shopA, 'Ana', haircut);
    bruno = await insertBarber(
      shopA,
      'Bruno',
      haircut,
      await userIdOf('bruno@a.com'),
    );
    foreignBarber = await insertBarber(
      shopB,
      'Davi',
      await insertService(shopB),
    );
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('CA-09.1: a barber blocks a period', () => {
    it('CA-09.1: Bruno blocks 12:00-13:00 on his own schedule and gets 201 with the UTC period', async () => {
      const response = await createBlock(
        { ...lunch(bruno), reason: 'Almoço' },
        brunoToken,
      ).expect(201);

      const body = response.body as CreatedBody;
      expect(body).toEqual({
        block: {
          id: expect.any(String) as string,
          barber: { id: bruno, name: 'Bruno' },
          kind: 'block',
          startsAt: '2026-10-01T15:00:00.000Z',
          endsAt: '2026-10-01T16:00:00.000Z',
          reason: 'Almoço',
        },
        affectedAppointments: [],
      });
      expect(await blockRows()).toEqual([
        {
          id: body.block.id,
          barbershop_id: shopA,
          barber_id: bruno,
          kind: 'block',
          starts_at: new Date('2026-10-01T15:00:00.000Z'),
          ends_at: new Date('2026-10-01T16:00:00.000Z'),
          reason: 'Almoço',
        },
      ]);
    });

    it('CA-09.1: the engine stops offering every start that overlaps the block (RN-05)', async () => {
      const before = await slots(bruno, THURSDAY);
      expect(startsOf(before)).toEqual(
        expect.arrayContaining([
          '2026-10-01T14:30:00.000Z',
          '2026-10-01T15:00:00.000Z',
          '2026-10-01T15:30:00.000Z',
          '2026-10-01T16:00:00.000Z',
        ]),
      );

      await created(lunch(bruno), brunoToken);

      const after = await slots(bruno, THURSDAY);
      expect(after).toEqual(
        before.filter(
          (slot) =>
            slot.endsAt.getTime() <= Date.parse('2026-10-01T15:00:00.000Z') ||
            slot.startsAt.getTime() >= Date.parse('2026-10-01T16:00:00.000Z'),
        ),
      );
      expect(startsOf(after)).toEqual(
        expect.arrayContaining([
          '2026-10-01T14:30:00.000Z',
          '2026-10-01T16:00:00.000Z',
        ]),
      );
      expect(startsOf(after)).not.toContain('2026-10-01T15:00:00.000Z');
      expect(startsOf(after)).not.toContain('2026-10-01T15:30:00.000Z');
    });

    it('CA-09.1: the engine rejects booking at 12:00 with RN-05', async () => {
      await created(lunch(bruno), brunoToken);

      const error = await app
        .get(BookAppointmentUseCase)
        .execute({
          barbershopId: shopA,
          barberId: bruno,
          serviceIds: [haircut],
          startsAt: new Date('2026-10-01T15:00:00.000Z'),
          origin: 'manual',
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BarberUnavailableError);
      expect(error).toMatchObject({
        rule: 'RN-05',
        message: 'O barbeiro está indisponível nesse horário.',
      });
      expect(await dataSource.query('SELECT id FROM appointments')).toEqual([]);
    });

    it('CA-09.1: the owner blocks any barber of the barbershop', async () => {
      const body = await created(lunch(ana), ownerToken);

      expect(body.block).toMatchObject({
        barber: { id: ana, name: 'Ana' },
        kind: 'block',
        startsAt: '2026-10-01T15:00:00.000Z',
        endsAt: '2026-10-01T16:00:00.000Z',
        reason: null,
      });
      expect((await blockRows()).map((row) => row.barber_id)).toEqual([ana]);
    });

    it('section 5: a barber blocking another barber answers 403 and saves nothing', async () => {
      await createBlock(lunch(ana), brunoToken).expect(403, FORBIDDEN);

      expect(await blockRows()).toEqual([]);
    });

    it('section 5: a barber user without a barber record answers 403 and saves nothing', async () => {
      await createBlock(lunch(ana), noRecordToken).expect(403, FORBIDDEN);

      expect(await blockRows()).toEqual([]);
    });

    it('RN-26: an unknown barber or one of another barbershop answers 404 and saves nothing', async () => {
      await createBlock(lunch(randomUUID()), ownerToken).expect(
        404,
        BARBER_NOT_FOUND,
      );
      await createBlock(lunch(foreignBarber), ownerToken).expect(
        404,
        BARBER_NOT_FOUND,
      );

      expect(await blockRows()).toEqual([]);
    });
  });

  describe('CA-09.2: the owner registers a day off', () => {
    it('CA-09.2: a day off covers the whole local day and empties that day only', async () => {
      const brunoThursday = await slots(bruno, THURSDAY);
      const anaFriday = await slots(ana, FRIDAY);
      expect(await slots(ana, THURSDAY)).not.toEqual([]);
      expect(brunoThursday).not.toEqual([]);
      expect(anaFriday).not.toEqual([]);

      const response = await createBlock(
        { kind: 'day_off', barberId: ana, date: THURSDAY },
        ownerToken,
      ).expect(201);

      expect(response.body).toEqual({
        block: {
          id: expect.any(String) as string,
          barber: { id: ana, name: 'Ana' },
          kind: 'day_off',
          startsAt: '2026-10-01T03:00:00.000Z',
          endsAt: '2026-10-02T03:00:00.000Z',
          reason: null,
        },
        affectedAppointments: [],
      });
      expect(await slots(ana, THURSDAY)).toEqual([]);
      expect(await slots(bruno, THURSDAY)).toEqual(brunoThursday);
      expect(await slots(ana, FRIDAY)).toEqual(anaFriday);
    });

    it('CA-09.2: a barber registers a day off on their own schedule, ignoring start and end', async () => {
      const body = await created(
        {
          kind: 'day_off',
          barberId: bruno,
          date: THURSDAY,
          start: '12:00',
          end: '13:00',
        },
        brunoToken,
      );

      expect(body.block).toMatchObject({
        barber: { id: bruno, name: 'Bruno' },
        kind: 'day_off',
        startsAt: '2026-10-01T03:00:00.000Z',
        endsAt: '2026-10-02T03:00:00.000Z',
      });
      expect(await slots(bruno, THURSDAY)).toEqual([]);
    });

    it('CA-09.2: a day off on a day the barbershop is closed is saved', async () => {
      const body = await created(
        { kind: 'day_off', barberId: ana, date: SUNDAY },
        ownerToken,
      );

      expect(body.block.startsAt).toBe('2026-10-04T03:00:00.000Z');
      expect(body.block.endsAt).toBe('2026-10-05T03:00:00.000Z');
    });

    it('CA-09.1: a block ending at 24:00 ends at local midnight of the next day', async () => {
      const body = await created(
        { ...lunch(ana), start: '17:00', end: '24:00' },
        ownerToken,
      );

      expect(body.block.startsAt).toBe('2026-10-01T20:00:00.000Z');
      expect(body.block.endsAt).toBe('2026-10-02T03:00:00.000Z');
    });

    it('CA-09.1: the same block twice is saved twice', async () => {
      await created(lunch(ana), ownerToken);
      await created(lunch(ana), ownerToken);

      expect(await blockRows()).toHaveLength(2);
    });
  });

  describe('CA-09.3: a block that reaches existing appointments', () => {
    let anaAppointment: string;
    const overlapping = () => ({
      kind: 'block',
      barberId: ana,
      date: THURSDAY,
      start: '10:30',
      end: '11:30',
    });

    beforeEach(async () => {
      // Ana: 10:00-10:45 local on thursday.
      anaAppointment = await insertAppointment(
        ana,
        '2026-10-01T13:00:00Z',
        '2026-10-01T13:45:00Z',
      );
    });

    const anaAppointmentBody = () => ({
      id: anaAppointment,
      barber: { id: ana, name: 'Ana' },
      client: null,
      services: [{ id: haircut, name: 'Corte' }],
      startsAt: '2026-10-01T13:00:00.000Z',
      endsAt: '2026-10-01T13:45:00.000Z',
      status: 'confirmed',
      origin: 'manual',
      clientConfirmedAt: null,
    });

    it('CA-09.3: without confirmation answers 409 with the appointments and saves nothing', async () => {
      const response = await createBlock(overlapping(), ownerToken).expect(409);

      expect(response.body).toEqual({
        message: CONFLICT_MESSAGE,
        appointments: [anaAppointmentBody()],
      });
      expect(await blockRows()).toEqual([]);
      expect(await appointmentRow(anaAppointment)).toEqual({
        status: 'confirmed',
        starts_at: new Date('2026-10-01T13:00:00.000Z'),
        ends_at: new Date('2026-10-01T13:45:00.000Z'),
      });
    });

    it('CA-09.3: with confirmConflicts true saves the block and keeps the appointment confirmed at 10:00', async () => {
      const response = await createBlock(
        { ...overlapping(), confirmConflicts: true },
        ownerToken,
      ).expect(201);

      const body = response.body as CreatedBody;
      expect(body.block).toMatchObject({
        barber: { id: ana, name: 'Ana' },
        startsAt: '2026-10-01T13:30:00.000Z',
        endsAt: '2026-10-01T14:30:00.000Z',
      });
      expect(body.affectedAppointments).toEqual([anaAppointmentBody()]);
      expect((await blockRows()).map((row) => row.id)).toEqual([body.block.id]);
      expect(await appointmentRow(anaAppointment)).toEqual({
        status: 'confirmed',
        starts_at: new Date('2026-10-01T13:00:00.000Z'),
        ends_at: new Date('2026-10-01T13:45:00.000Z'),
      });
    });

    it('CA-09.3: a barber blocking their own schedule over an appointment also gets 409', async () => {
      const brunoAppointment = await insertAppointment(
        bruno,
        '2026-10-01T15:00:00Z',
        '2026-10-01T15:30:00Z',
      );

      const response = await createBlock(lunch(bruno), brunoToken).expect(409);

      expect(
        (response.body as { appointments: { id: string }[] }).appointments.map(
          ({ id }) => id,
        ),
      ).toEqual([brunoAppointment]);
      expect(await blockRows()).toEqual([]);
    });

    it('CA-09.3: a day off lists every appointment of the day by start, including one crossing midnight', async () => {
      const lateAppointment = await insertAppointment(
        ana,
        '2026-10-02T02:30:00Z',
        '2026-10-02T03:15:00Z',
      );

      const response = await createBlock(
        { kind: 'day_off', barberId: ana, date: THURSDAY },
        ownerToken,
      ).expect(409);

      expect(
        (response.body as { appointments: { id: string }[] }).appointments.map(
          ({ id }) => id,
        ),
      ).toEqual([anaAppointment, lateAppointment]);
      expect(await blockRows()).toEqual([]);
    });

    it('CA-09.3: a block that only touches the appointment has no conflict', async () => {
      const body = await created(
        { ...overlapping(), start: '10:45' },
        ownerToken,
      );

      expect(body.affectedAppointments).toEqual([]);
      expect(await blockRows()).toHaveLength(1);
    });

    it('CA-09.3: confirmConflicts true without a conflict saves with an empty list', async () => {
      const body = await created(
        { ...lunch(ana), confirmConflicts: true },
        ownerToken,
      );

      expect(body.affectedAppointments).toEqual([]);
      expect(await blockRows()).toHaveLength(1);
    });
  });

  describe('RF-26: listing and removing blocks', () => {
    let anaLunch: string;
    let anaDayOff: string;
    let brunoMorning: string;

    beforeEach(async () => {
      anaLunch = (await created(lunch(ana), ownerToken)).block.id;
      anaDayOff = (
        await created(
          { kind: 'day_off', barberId: ana, date: FRIDAY },
          ownerToken,
        )
      ).block.id;
      brunoMorning = (
        await created(
          { ...lunch(bruno), start: '09:00', end: '10:00', reason: 'Médico' },
          brunoToken,
        )
      ).block.id;
    });

    it('RF-26: the owner lists the week in order with the period and timezone', async () => {
      const response = await listBlocks(
        { view: 'week', date: THURSDAY },
        ownerToken,
      ).expect(200);

      expect(response.body).toEqual({
        view: 'week',
        startDate: '2026-09-28',
        endDate: '2026-10-04',
        timezone: 'America/Sao_Paulo',
        blocks: [
          {
            id: brunoMorning,
            barber: { id: bruno, name: 'Bruno' },
            kind: 'block',
            startsAt: '2026-10-01T12:00:00.000Z',
            endsAt: '2026-10-01T13:00:00.000Z',
            reason: 'Médico',
          },
          {
            id: anaLunch,
            barber: { id: ana, name: 'Ana' },
            kind: 'block',
            startsAt: '2026-10-01T15:00:00.000Z',
            endsAt: '2026-10-01T16:00:00.000Z',
            reason: null,
          },
          {
            id: anaDayOff,
            barber: { id: ana, name: 'Ana' },
            kind: 'day_off',
            startsAt: '2026-10-02T03:00:00.000Z',
            endsAt: '2026-10-03T03:00:00.000Z',
            reason: null,
          },
        ],
      });
    });

    it('RF-26: the owner filters by barber and by day', async () => {
      const byBarber = await listBlocks(
        { view: 'week', date: THURSDAY, barberId: ana },
        ownerToken,
      ).expect(200);
      const byDay = await listBlocks(
        { view: 'day', date: FRIDAY },
        ownerToken,
      ).expect(200);

      expect((byBarber.body as ListBody).blocks.map(({ id }) => id)).toEqual([
        anaLunch,
        anaDayOff,
      ]);
      expect((byDay.body as ListBody).blocks.map(({ id }) => id)).toEqual([
        anaDayOff,
      ]);
    });

    it('section 5: a barber lists only their own blocks', async () => {
      const response = await listBlocks(
        { view: 'week', date: THURSDAY },
        brunoToken,
      ).expect(200);

      expect((response.body as ListBody).blocks.map(({ id }) => id)).toEqual([
        brunoMorning,
      ]);
    });

    it('section 5: a barber asking for another barber answers 403', async () => {
      await listBlocks(
        { view: 'week', date: THURSDAY, barberId: ana },
        brunoToken,
      ).expect(403, FORBIDDEN);
    });

    it('section 5: a barber user without a barber record gets 200 with an empty list', async () => {
      const response = await listBlocks(
        { view: 'week', date: THURSDAY },
        noRecordToken,
      ).expect(200);

      expect((response.body as ListBody).blocks).toEqual([]);
    });

    it('RN-26: the owner filtering by a barber of another barbershop answers 404', async () => {
      await listBlocks(
        { view: 'week', date: THURSDAY, barberId: foreignBarber },
        ownerToken,
      ).expect(404, BARBER_NOT_FOUND);
    });

    it('RN-26: a block of another barbershop does not appear in the listing', async () => {
      const foreignBlock = (await created(lunch(foreignBarber), ownerBToken))
        .block.id;

      const ownList = await listBlocks(
        { view: 'week', date: THURSDAY },
        ownerToken,
      ).expect(200);
      const foreignList = await listBlocks(
        { view: 'week', date: THURSDAY },
        ownerBToken,
      ).expect(200);

      expect(
        (ownList.body as ListBody).blocks.map(({ id }) => id),
      ).not.toContain(foreignBlock);
      expect((foreignList.body as ListBody).blocks.map(({ id }) => id)).toEqual(
        [foreignBlock],
      );
    });

    it('section 5: Bruno removing the block of Ana answers 403 and removes nothing', async () => {
      await removeBlock(anaLunch, brunoToken).expect(403, FORBIDDEN);

      expect((await blockRows()).map((row) => row.id)).toContain(anaLunch);
    });

    it('RF-26: the owner removes the block with 204 and 12:00 is offered again (RN-05)', async () => {
      expect(startsOf(await slots(ana, THURSDAY))).not.toContain(
        '2026-10-01T15:00:00.000Z',
      );

      const response = await removeBlock(anaLunch, ownerToken).expect(204);

      expect(response.body).toEqual({});
      expect((await blockRows()).map((row) => row.id)).not.toContain(anaLunch);
      expect(startsOf(await slots(ana, THURSDAY))).toContain(
        '2026-10-01T15:00:00.000Z',
      );
    });

    it('section 5: a barber removes their own block with 204', async () => {
      await removeBlock(brunoMorning, brunoToken).expect(204);

      expect((await blockRows()).map((row) => row.id)).not.toContain(
        brunoMorning,
      );
    });

    it('section 5: a barber user without a barber record removing a block answers 403', async () => {
      await removeBlock(anaLunch, noRecordToken).expect(403, FORBIDDEN);

      expect((await blockRows()).map((row) => row.id)).toContain(anaLunch);
    });

    it('RN-26: an unknown block answers 404 "Bloqueio não encontrado."', async () => {
      await removeBlock(randomUUID(), ownerToken).expect(404, BLOCK_NOT_FOUND);

      expect(await blockRows()).toHaveLength(3);
    });

    it('RN-26: a block of another barbershop answers 404 and is not removed', async () => {
      const foreignBlock = (await created(lunch(foreignBarber), ownerBToken))
        .block.id;

      await removeBlock(foreignBlock, ownerToken).expect(404, BLOCK_NOT_FOUND);

      expect((await blockRows()).map((row) => row.id)).toContain(foreignBlock);
    });
  });

  describe('validation, session and documentation', () => {
    it('section 5: the three routes answer 401 without a session', async () => {
      await createBlock(lunch(ana)).expect(401, UNAUTHORIZED);
      await listBlocks({ view: 'week', date: THURSDAY }).expect(
        401,
        UNAUTHORIZED,
      );
      await removeBlock(randomUUID()).expect(401, UNAUTHORIZED);
    });

    it('BLQ-19: an unknown kind answers 400 with the message and saves nothing', async () => {
      const response = await createBlock(
        { ...lunch(ana), kind: 'holiday' },
        ownerToken,
      ).expect(400);

      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [
          { field: 'kind', message: 'Escolha o tipo: block ou day_off.' },
        ],
      });
      expect(await blockRows()).toEqual([]);
    });

    it('BLQ-19: an end equal to the start answers 400 with the message', async () => {
      const response = await createBlock(
        { ...lunch(ana), start: '12:00', end: '12:00' },
        ownerToken,
      ).expect(400);

      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [
          {
            field: 'end',
            message: 'O fim do bloqueio deve ser depois do início.',
          },
        ],
      });
      expect(await blockRows()).toEqual([]);
    });

    it('BLQ-19: the listing answers 400 for an unknown view', async () => {
      const response = await listBlocks(
        { view: 'month', date: THURSDAY },
        ownerToken,
      ).expect(400);

      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [{ field: 'view', message: 'Escolha a visão: day ou week.' }],
      });
    });

    it('BLQ-19: the removal answers 400 for a block id that is not a UUID', async () => {
      const response = await removeBlock('lunch', ownerToken).expect(400);

      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [
          { field: 'blockId', message: 'Informe um id de bloqueio válido.' },
        ],
      });
    });

    it('BLQ-28: documents the three routes with US-09, both profiles and every response', () => {
      const paths = buildApiDocument(app).paths;
      const operations = [
        {
          operation: paths['/blocks'].post!,
          // US-21: a write also answers 402 while the barbershop is suspended.
          statuses: ['201', '400', '401', '402', '403', '404', '409'],
        },
        {
          operation: paths['/blocks'].get!,
          statuses: ['200', '400', '401', '403', '404'],
        },
        {
          operation: paths['/blocks/{blockId}'].delete!,
          statuses: ['204', '400', '401', '402', '403', '404'],
        },
      ];

      for (const { operation, statuses } of operations) {
        expect(operation.summary).toContain('US-09');
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
      const conflict = paths['/blocks'].post!.responses[
        '409'
      ] as ResponseObject;
      const conflictSchema = conflict.content?.['application/json']
        ?.schema as SchemaObject;
      expect(Object.keys(conflictSchema.properties ?? {})).toEqual([
        'message',
        'appointments',
      ]);
    });
  });
});

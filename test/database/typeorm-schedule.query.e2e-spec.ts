import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmScheduleQuery } from '../../src/infrastructure/database/repositories/typeorm-schedule.query';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

// Monday 2026-10-05 in America/Sao_Paulo (UTC-3).
const MONDAY = {
  start: new Date('2026-10-05T03:00:00.000Z'),
  end: new Date('2026-10-06T03:00:00.000Z'),
};

describe('TypeOrmScheduleQuery (e2e)', () => {
  let dataSource: DataSource;
  let query: TypeOrmScheduleQuery;
  let barbershopA: string;
  let barbershopB: string;

  async function insertBarbershop(): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`,
      [id],
    );
    return id;
  }

  async function insertBarber(
    barbershopId: string,
    name: string,
    active = true,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, NULL, $4, now())`,
      [id, barbershopId, name, active],
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

  async function insertClient(
    barbershopId: string,
    name: string,
    phone: string,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [id, barbershopId, name, phone],
    );
    return id;
  }

  async function insertAppointment(row: {
    barbershopId?: string;
    barberId: string;
    startsAt: string;
    endsAt: string;
    serviceIds: string[];
    clientId?: string | null;
    origin?: 'bot' | 'manual';
  }): Promise<string> {
    const id = randomUUID();
    const barbershopId = row.barbershopId ?? barbershopA;
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, now())`,
      [
        id,
        barbershopId,
        row.barberId,
        row.clientId ?? null,
        row.startsAt,
        row.endsAt,
        row.origin ?? 'manual',
      ],
    );
    for (const [position, serviceId] of row.serviceIds.entries()) {
      await dataSource.query(
        `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
         VALUES ($1, $2, $3, $4)`,
        [id, position, serviceId, barbershopId],
      );
    }
    return id;
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    query = new TypeOrmScheduleQuery(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    barbershopA = await insertBarbershop();
    barbershopB = await insertBarbershop();
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  describe('CA-08.1: period boundaries', () => {
    it('CA-08.1: returns the appointments that start inside [start, end) and nothing else', async () => {
      const ana = await insertBarber(barbershopA, 'Ana');
      const haircut = await insertService(barbershopA, 'Corte');
      const atMidnight = await insertAppointment({
        barberId: ana,
        startsAt: '2026-10-05T03:00:00Z',
        endsAt: '2026-10-05T03:30:00Z',
        serviceIds: [haircut],
      });
      const crossingMidnight = await insertAppointment({
        barberId: ana,
        startsAt: '2026-10-06T02:30:00Z',
        endsAt: '2026-10-06T03:30:00Z',
        serviceIds: [haircut],
      });
      await insertAppointment({
        barberId: ana,
        startsAt: '2026-10-05T02:30:00Z',
        endsAt: '2026-10-05T03:00:00Z',
        serviceIds: [haircut],
      });
      await insertAppointment({
        barberId: ana,
        startsAt: '2026-10-06T03:30:00Z',
        endsAt: '2026-10-06T04:00:00Z',
        serviceIds: [haircut],
      });
      await insertAppointment({
        barberId: await insertBarber(barbershopA, 'Bruno'),
        startsAt: '2026-10-06T03:00:00Z',
        endsAt: '2026-10-06T03:30:00Z',
        serviceIds: [haircut],
      });

      const entries = await query.listStartingIn(barbershopA, MONDAY, null);

      expect(entries.map((entry) => entry.id)).toEqual([
        atMidnight,
        crossingMidnight,
      ]);
    });

    it('CA-08.1: leaves out an appointment that starts before the period and ends inside it', async () => {
      const ana = await insertBarber(barbershopA, 'Ana');
      const haircut = await insertService(barbershopA, 'Corte');
      await insertAppointment({
        barberId: ana,
        startsAt: '2026-10-05T02:30:00Z',
        endsAt: '2026-10-05T03:30:00Z',
        serviceIds: [haircut],
      });

      expect(await query.listStartingIn(barbershopA, MONDAY, null)).toEqual([]);
    });
  });

  describe('CA-08.1: barber filter and order', () => {
    it('CA-08.1: returns only the given barber when a barber id is passed', async () => {
      const ana = await insertBarber(barbershopA, 'Ana');
      const bruno = await insertBarber(barbershopA, 'Bruno');
      const haircut = await insertService(barbershopA, 'Corte');
      await insertAppointment({
        barberId: ana,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
        serviceIds: [haircut],
      });
      const ofBruno = await insertAppointment({
        barberId: bruno,
        startsAt: '2026-10-05T14:00:00Z',
        endsAt: '2026-10-05T14:30:00Z',
        serviceIds: [haircut],
      });

      const entries = await query.listStartingIn(barbershopA, MONDAY, bruno);

      expect(entries.map((entry) => entry.id)).toEqual([ofBruno]);
    });

    it('CA-08.1: orders by start, then by barber name ignoring case', async () => {
      const bruno = await insertBarber(barbershopA, 'Bruno');
      const ana = await insertBarber(barbershopA, 'ana');
      const caio = await insertBarber(barbershopA, 'Caio');
      const haircut = await insertService(barbershopA, 'Corte');
      const caioFirst = await insertAppointment({
        barberId: caio,
        startsAt: '2026-10-05T12:00:00Z',
        endsAt: '2026-10-05T12:30:00Z',
        serviceIds: [haircut],
      });
      const brunoAtOne = await insertAppointment({
        barberId: bruno,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
        serviceIds: [haircut],
      });
      const anaAtOne = await insertAppointment({
        barberId: ana,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
        serviceIds: [haircut],
      });

      const entries = await query.listStartingIn(barbershopA, MONDAY, null);

      expect(entries.map((entry) => entry.id)).toEqual([
        caioFirst,
        anaAtOne,
        brunoAtOne,
      ]);
    });
  });

  describe('CA-08.3: appointment details', () => {
    it('CA-08.3: returns barber, client, services in booked order, times, status and origin', async () => {
      const ana = await insertBarber(barbershopA, 'Ana');
      const haircut = await insertService(barbershopA, 'Corte');
      const beard = await insertService(barbershopA, 'Barba');
      const joao = await insertClient(barbershopA, 'João', '+5511987654321');
      const id = await insertAppointment({
        barberId: ana,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:45:00Z',
        serviceIds: [haircut, beard],
        clientId: joao,
        origin: 'manual',
      });

      const entries = await query.listStartingIn(barbershopA, MONDAY, null);

      expect(entries).toEqual([
        {
          id,
          barber: { id: ana, name: 'Ana' },
          client: { id: joao, name: 'João', phone: '+5511987654321' },
          services: [
            { id: haircut, name: 'Corte' },
            { id: beard, name: 'Barba' },
          ],
          startsAt: new Date('2026-10-05T13:00:00.000Z'),
          endsAt: new Date('2026-10-05T13:45:00.000Z'),
          status: 'confirmed',
          origin: 'manual',
        },
      ]);
    });

    it('CA-08.3: returns a null client and the bot origin (RF-28)', async () => {
      const ana = await insertBarber(barbershopA, 'Ana', false);
      const haircut = await insertService(barbershopA, 'Corte');
      await insertAppointment({
        barberId: ana,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
        serviceIds: [haircut],
        origin: 'bot',
      });

      const [entry] = await query.listStartingIn(barbershopA, MONDAY, null);

      expect(entry.client).toBeNull();
      expect(entry.origin).toBe('bot');
      expect(entry.barber).toEqual({ id: ana, name: 'Ana' });
    });
  });

  describe('RN-26: tenant isolation', () => {
    it('RN-26: never returns appointments of another barbershop', async () => {
      const ana = await insertBarber(barbershopA, 'Ana');
      const haircut = await insertService(barbershopA, 'Corte');
      const own = await insertAppointment({
        barberId: ana,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
        serviceIds: [haircut],
      });
      const foreignBarber = await insertBarber(barbershopB, 'Ana');
      await insertAppointment({
        barbershopId: barbershopB,
        barberId: foreignBarber,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
        serviceIds: [await insertService(barbershopB, 'Corte')],
      });

      const entries = await query.listStartingIn(barbershopA, MONDAY, null);

      expect(entries.map((entry) => entry.id)).toEqual([own]);
    });

    it('RN-26: a forged barber id of another barbershop returns nothing', async () => {
      const foreignBarber = await insertBarber(barbershopB, 'Ana');
      await insertAppointment({
        barbershopId: barbershopB,
        barberId: foreignBarber,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
        serviceIds: [await insertService(barbershopB, 'Corte')],
      });

      expect(
        await query.listStartingIn(barbershopA, MONDAY, foreignBarber),
      ).toEqual([]);
    });
  });
});

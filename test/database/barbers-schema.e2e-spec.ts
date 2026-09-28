import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

interface WorkingDayRow {
  startsAt: string;
  endsAt: string;
  breakStartsAt?: string | null;
  breakEndsAt?: string | null;
}

describe('Barbers schema (e2e)', () => {
  let dataSource: DataSource;
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

  async function insertUser(barbershopId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO users (id, barbershop_id, name, email, phone, password_hash, role, created_at)
       VALUES ($1, $2, 'João Pereira', $3, NULL, 'hash', 'barber', now())`,
      [id, barbershopId, `${id}@example.com`],
    );
    return id;
  }

  async function insertService(barbershopId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, 4500, 30, true, now())`,
      [id, barbershopId, `Serviço ${id}`],
    );
    return id;
  }

  async function insertBarber(
    row: { barbershopId?: string; name?: string; userId?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, $4, true, now())`,
      [
        id,
        row.barbershopId ?? barbershopA,
        row.name ?? `Barbeiro ${id}`,
        row.userId ?? null,
      ],
    );
    return id;
  }

  function insertBarberService(row: {
    barberId: string;
    serviceId: string;
    barbershopId: string;
  }) {
    return dataSource.query(
      `INSERT INTO barber_services (barber_id, service_id, barbershop_id, position)
       VALUES ($1, $2, $3, 0)`,
      [row.barberId, row.serviceId, row.barbershopId],
    );
  }

  function insertWorkingDay(barberId: string, day: WorkingDayRow) {
    return dataSource.query(
      `INSERT INTO barber_working_hours (barber_id, weekday, starts_at, ends_at, break_starts_at, break_ends_at)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [
        barberId,
        day.startsAt,
        day.endsAt,
        day.breakStartsAt ?? null,
        day.breakEndsAt ?? null,
      ],
    );
  }

  async function count(table: string): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM ${table}`,
    );
    return Number(row.count);
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
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

  describe('CA-05.1: barber name', () => {
    it('rejects "joão" when "João" exists in the same barbershop', async () => {
      await insertBarber({ name: 'João' });

      const insert = insertBarber({ name: 'joão' });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: UNIQUE_VIOLATION,
          constraint: 'barbers_name_unique',
        },
      });
      expect(await count('barbers')).toBe(1);
    });

    it('accepts the same name in another barbershop', async () => {
      await insertBarber({ name: 'João' });

      await insertBarber({ barbershopId: barbershopB, name: 'João' });

      expect(await count('barbers')).toBe(2);
    });
  });

  describe('CA-05.2: link with a panel user', () => {
    it('rejects two barbers linked to the same user', async () => {
      const userId = await insertUser(barbershopA);
      await insertBarber({ userId });

      const insert = insertBarber({ userId });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: UNIQUE_VIOLATION,
          constraint: 'barbers_user_id_unique',
        },
      });
      expect(await count('barbers')).toBe(1);
    });

    it('accepts many barbers without a user', async () => {
      await insertBarber({ userId: null });
      await insertBarber({ userId: null });

      expect(await count('barbers')).toBe(2);
    });

    it('rejects a user of another barbershop', async () => {
      const foreignUser = await insertUser(barbershopB);

      const insert = insertBarber({ userId: foreignUser });

      await expect(insert).rejects.toBeInstanceOf(QueryFailedError);
      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: FOREIGN_KEY_VIOLATION,
          constraint: 'barbers_user_fk',
        },
      });
      expect(await count('barbers')).toBe(0);
    });

    it('deleting the user clears only user_id and keeps the barber, its services and working hours', async () => {
      const userId = await insertUser(barbershopA);
      const serviceId = await insertService(barbershopA);
      const barberId = await insertBarber({ name: 'João', userId });
      await insertBarberService({
        barberId,
        serviceId,
        barbershopId: barbershopA,
      });
      await insertWorkingDay(barberId, { startsAt: '09:00', endsAt: '18:00' });

      await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);

      const [barber] = await dataSource.query<
        { barbershop_id: string; name: string; user_id: string | null }[]
      >('SELECT barbershop_id, name, user_id FROM barbers WHERE id = $1', [
        barberId,
      ]);
      expect(barber).toEqual({
        barbershop_id: barbershopA,
        name: 'João',
        user_id: null,
      });
      expect(await count('barber_services')).toBe(1);
      expect(await count('barber_working_hours')).toBe(1);
    });
  });

  describe('RN-26: services performed stay in the barbershop', () => {
    it('accepts a service of the same barbershop', async () => {
      const barberId = await insertBarber();
      const serviceId = await insertService(barbershopA);

      await insertBarberService({
        barberId,
        serviceId,
        barbershopId: barbershopA,
      });

      expect(await count('barber_services')).toBe(1);
    });

    it('rejects a service of another barbershop', async () => {
      const barberId = await insertBarber();
      const foreignService = await insertService(barbershopB);

      const insert = insertBarberService({
        barberId,
        serviceId: foreignService,
        barbershopId: barbershopA,
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: FOREIGN_KEY_VIOLATION,
          constraint: 'barber_services_service_fk',
        },
      });
      expect(await count('barber_services')).toBe(0);
    });

    it('rejects a barber of another barbershop', async () => {
      const foreignBarber = await insertBarber({ barbershopId: barbershopB });
      const serviceId = await insertService(barbershopA);

      const insert = insertBarberService({
        barberId: foreignBarber,
        serviceId,
        barbershopId: barbershopA,
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: FOREIGN_KEY_VIOLATION,
          constraint: 'barber_services_barber_fk',
        },
      });
      expect(await count('barber_services')).toBe(0);
    });
  });

  describe('CA-05.1: working hours CHECK', () => {
    it.each([
      ['an end equal to the start', { startsAt: '09:00', endsAt: '09:00' }],
      ['an end before the start', { startsAt: '18:00', endsAt: '09:00' }],
      [
        'a break starting at the start',
        {
          startsAt: '09:00',
          endsAt: '18:00',
          breakStartsAt: '09:00',
          breakEndsAt: '12:00',
        },
      ],
      [
        'a break ending at the end',
        {
          startsAt: '09:00',
          endsAt: '18:00',
          breakStartsAt: '17:00',
          breakEndsAt: '18:00',
        },
      ],
      [
        'a break ending at its start',
        {
          startsAt: '09:00',
          endsAt: '18:00',
          breakStartsAt: '12:00',
          breakEndsAt: '12:00',
        },
      ],
      [
        'a break without its start',
        {
          startsAt: '09:00',
          endsAt: '18:00',
          breakStartsAt: null,
          breakEndsAt: '13:00',
        },
      ],
      [
        'a break without its end',
        {
          startsAt: '09:00',
          endsAt: '18:00',
          breakStartsAt: '12:00',
          breakEndsAt: null,
        },
      ],
    ])('rejects %s', async (_case, day) => {
      const barberId = await insertBarber();

      const insert = insertWorkingDay(barberId, day);

      await expect(insert).rejects.toMatchObject({
        driverError: { code: CHECK_VIOLATION },
      });
      expect(await count('barber_working_hours')).toBe(0);
    });

    it.each([
      [
        'an end one minute after the start',
        { startsAt: '09:00', endsAt: '09:01' },
      ],
      [
        'a break one minute inside each limit',
        {
          startsAt: '09:00',
          endsAt: '18:00',
          breakStartsAt: '09:01',
          breakEndsAt: '17:59',
        },
      ],
    ])('accepts %s', async (_case, day) => {
      const barberId = await insertBarber();

      await insertWorkingDay(barberId, day);

      expect(await count('barber_working_hours')).toBe(1);
    });
  });
});

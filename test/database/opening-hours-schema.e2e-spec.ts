import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const CHECK_VIOLATION = '23514';

describe('Opening hours schema (e2e)', () => {
  let dataSource: DataSource;
  let barbershopId: string;

  function insertDay(row: {
    weekday: number;
    opensAt: string;
    closesAt: string;
    breakStartsAt?: string | null;
    breakEndsAt?: string | null;
  }): Promise<unknown> {
    return dataSource.query(
      `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at, break_starts_at, break_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        barbershopId,
        row.weekday,
        row.opensAt,
        row.closesAt,
        row.breakStartsAt ?? null,
        row.breakEndsAt ?? null,
      ],
    );
  }

  async function countDays(): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM barbershop_opening_hours WHERE barbershop_id = $1',
      [barbershopId],
    );
    return Number(row.count);
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    barbershopId = randomUUID();
    await dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`,
      [barbershopId],
    );
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('CA-03.2: accepts a coherent day with a break inside the opening hours', async () => {
    await insertDay({
      weekday: 1,
      opensAt: '09:00',
      closesAt: '19:00',
      breakStartsAt: '12:00',
      breakEndsAt: '13:00',
    });

    expect(await countDays()).toBe(1);
  });

  it.each([
    ['closing before opening', { opensAt: '18:00', closesAt: '09:00' }],
    ['closing equal to opening', { opensAt: '09:00', closesAt: '09:00' }],
    [
      'a break outside the opening hours',
      {
        opensAt: '09:00',
        closesAt: '19:00',
        breakStartsAt: '08:00',
        breakEndsAt: '10:00',
      },
    ],
    [
      'a break ending before it starts',
      {
        opensAt: '09:00',
        closesAt: '19:00',
        breakStartsAt: '13:00',
        breakEndsAt: '12:00',
      },
    ],
    [
      'a break with only its start',
      { opensAt: '09:00', closesAt: '19:00', breakStartsAt: '12:00' },
    ],
    [
      'a break with only its end',
      { opensAt: '09:00', closesAt: '19:00', breakEndsAt: '13:00' },
    ],
  ])(
    'CA-03.2: the database rejects %s with a CHECK violation',
    async (_case, row) => {
      const insert = insertDay({ weekday: 1, ...row });

      await expect(insert).rejects.toBeInstanceOf(QueryFailedError);
      await expect(insert).rejects.toMatchObject({
        driverError: { code: CHECK_VIOLATION },
      });
      expect(await countDays()).toBe(0);
    },
  );

  it.each([0, 8])(
    'CA-03.2: the database rejects weekday %i (ISO 1-7 only)',
    async (weekday) => {
      const insert = insertDay({
        weekday,
        opensAt: '09:00',
        closesAt: '19:00',
      });

      await expect(insert).rejects.toMatchObject({
        driverError: { code: CHECK_VIOLATION },
      });
      expect(await countDays()).toBe(0);
    },
  );
});

import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { AddBookingRules1790601890528 } from '../../src/infrastructure/database/migrations/1790601890528-AddBookingRules';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const CHECK_VIOLATION = '23514';

interface RulesRow {
  minimum_advance_minutes: number;
  cancellation_deadline_minutes: number;
  no_show_limit: number;
  waitlist_offer_minutes: number;
  return_reminder_days: number;
}

type RuleColumn = keyof RulesRow;

const VALID_ROW: RulesRow = {
  minimum_advance_minutes: 30,
  cancellation_deadline_minutes: 240,
  no_show_limit: 3,
  waitlist_offer_minutes: 20,
  return_reminder_days: 45,
};

const INSERT_BARBERSHOP = `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
  VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`;

describe('Booking rules schema (e2e)', () => {
  let dataSource: DataSource;
  let barbershopId: string;

  function insertRules(row: RulesRow): Promise<unknown> {
    return dataSource.query(
      `INSERT INTO barbershop_booking_rules (barbershop_id, minimum_advance_minutes, cancellation_deadline_minutes, no_show_limit, waitlist_offer_minutes, return_reminder_days)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        barbershopId,
        row.minimum_advance_minutes,
        row.cancellation_deadline_minutes,
        row.no_show_limit,
        row.waitlist_offer_minutes,
        row.return_reminder_days,
      ],
    );
  }

  async function countRules(): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM barbershop_booking_rules WHERE barbershop_id = $1',
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
    await dataSource.query(INSERT_BARBERSHOP, [barbershopId]);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it.each<[RuleColumn, number]>([
    ['minimum_advance_minutes', 0],
    ['minimum_advance_minutes', 10080],
    ['cancellation_deadline_minutes', 0],
    ['cancellation_deadline_minutes', 10080],
    ['no_show_limit', 1],
    ['no_show_limit', 10],
    ['waitlist_offer_minutes', 5],
    ['waitlist_offer_minutes', 120],
    ['return_reminder_days', 7],
    ['return_reminder_days', 365],
  ])('CA-06.3: accepts %s = %p (exact limit)', async (column, value) => {
    await insertRules({ ...VALID_ROW, [column]: value });

    expect(await countRules()).toBe(1);
  });

  it.each<[RuleColumn, number]>([
    ['minimum_advance_minutes', -5],
    ['minimum_advance_minutes', 10085],
    ['minimum_advance_minutes', 7],
    ['cancellation_deadline_minutes', -5],
    ['cancellation_deadline_minutes', 10085],
    ['cancellation_deadline_minutes', 7],
    ['no_show_limit', -1],
    ['no_show_limit', 0],
    ['no_show_limit', 11],
    ['waitlist_offer_minutes', -5],
    ['waitlist_offer_minutes', 4],
    ['waitlist_offer_minutes', 121],
    ['return_reminder_days', -7],
    ['return_reminder_days', 6],
    ['return_reminder_days', 366],
  ])(
    'CA-06.3: rejects %s = %p with a CHECK violation',
    async (column, value) => {
      const insert = insertRules({ ...VALID_ROW, [column]: value });

      await expect(insert).rejects.toBeInstanceOf(QueryFailedError);
      await expect(insert).rejects.toMatchObject({
        driverError: { code: CHECK_VIOLATION },
      });
      expect(await countRules()).toBe(0);
    },
  );

  it('CA-06.3: rejects an UPDATE that breaks a rule and keeps the stored row', async () => {
    await insertRules(VALID_ROW);

    await expect(
      dataSource.query(
        'UPDATE barbershop_booking_rules SET no_show_limit = 0 WHERE barbershop_id = $1',
        [barbershopId],
      ),
    ).rejects.toMatchObject({ driverError: { code: CHECK_VIOLATION } });
    const [row] = await dataSource.query<RulesRow[]>(
      'SELECT no_show_limit FROM barbershop_booking_rules WHERE barbershop_id = $1',
      [barbershopId],
    );
    expect(row.no_show_limit).toBe(3);
  });

  it('CA-06.1: the migration writes the five defaults on barbershops that already exist', async () => {
    const migration = new AddBookingRules1790601890528();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await migration.down(queryRunner);
      const otherId = randomUUID();
      await queryRunner.query(INSERT_BARBERSHOP, [otherId]);

      await migration.up(queryRunner);

      const rows = await queryRunner.query<(RulesRow & { id: string })[]>(
        `SELECT b.id, r.minimum_advance_minutes, r.cancellation_deadline_minutes, r.no_show_limit, r.waitlist_offer_minutes, r.return_reminder_days
         FROM barbershops b LEFT JOIN barbershop_booking_rules r ON r.barbershop_id = b.id
         ORDER BY b.id`,
      );
      expect(rows).toEqual(
        [barbershopId, otherId].sort().map((id) => ({
          id,
          minimum_advance_minutes: 60,
          cancellation_deadline_minutes: 120,
          no_show_limit: 2,
          waitlist_offer_minutes: 15,
          return_reminder_days: 30,
        })),
      );
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  });
});

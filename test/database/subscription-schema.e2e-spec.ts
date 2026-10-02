import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

interface PostgresError {
  driverError?: { code?: string };
}

async function violation(query: Promise<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (error) {
    return (error as PostgresError).driverError?.code;
  }
}

describe('US-20 subscription schema (e2e)', () => {
  let dataSource: DataSource;
  let shopA: string;
  let shopB: string;

  function insertShop(id: string): Promise<unknown> {
    return dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`,
      [id],
    );
  }

  function insertSubscription(
    barbershopId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<unknown> {
    const row = {
      payment_method: 'pix',
      gateway_subscription_id: null,
      gateway_checkout_id: null,
      ...overrides,
    };
    return dataSource.query(
      `INSERT INTO barbershop_subscriptions
         (barbershop_id, payment_method, gateway_subscription_id, gateway_checkout_id)
       VALUES ($1, $2, $3, $4)`,
      [
        barbershopId,
        row.payment_method,
        row.gateway_subscription_id,
        row.gateway_checkout_id,
      ],
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    shopA = randomUUID();
    shopB = randomUUID();
    await insertShop(shopA);
    await insertShop(shopB);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('door 3: subscription_status takes only trialing, active and past_due (C43)', async () => {
    for (const status of ['active', 'past_due', 'trialing']) {
      await dataSource.query(
        'UPDATE barbershops SET subscription_status = $2 WHERE id = $1',
        [shopA, status],
      );
    }
    expect(
      await violation(
        dataSource.query(
          `UPDATE barbershops SET subscription_status = 'expired' WHERE id = $1`,
          [shopA],
        ),
      ),
    ).toBe(CHECK_VIOLATION);
  });

  it('door 1: payment_method takes only credit_card and pix (C43)', async () => {
    await insertSubscription(shopA, { payment_method: 'credit_card' });
    expect(
      await violation(insertSubscription(shopB, { payment_method: 'boleto' })),
    ).toBe(CHECK_VIOLATION);
  });

  it('door 1: a gateway subscription belongs to one barbershop; nulls do not clash (C43)', async () => {
    await insertSubscription(shopA);
    await insertSubscription(shopB);
    await dataSource.query(
      `UPDATE barbershop_subscriptions SET gateway_subscription_id = 'sub_1' WHERE barbershop_id = $1`,
      [shopA],
    );

    expect(
      await violation(
        dataSource.query(
          `UPDATE barbershop_subscriptions SET gateway_subscription_id = 'sub_1' WHERE barbershop_id = $1`,
          [shopB],
        ),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('door 1: a barbershop has at most one subscription (C43)', async () => {
    await insertSubscription(shopA);

    expect(await violation(insertSubscription(shopA))).toBe(UNIQUE_VIOLATION);
  });

  it('door 2: a gateway event is recorded once (C43)', async () => {
    const insert = () =>
      dataSource.query(
        `INSERT INTO payment_gateway_events (gateway, event_id, barbershop_id, received_at)
         VALUES ('asaas', 'evt_1', $1, now())`,
        [shopA],
      );
    await insert();

    expect(await violation(insert())).toBe(UNIQUE_VIOLATION);
  });

  it('door 7: trial_warning_sent_at starts null (C43)', async () => {
    const [row] = await dataSource.query<
      { trial_warning_sent_at: Date | null }[]
    >('SELECT trial_warning_sent_at FROM barbershops WHERE id = $1', [shopA]);

    expect(row.trial_warning_sent_at).toBeNull();
  });

  it('the migration reverts and runs again (C43)', async () => {
    await truncateAccountTables(dataSource);

    await dataSource.undoLastMigration();
    const [{ exists }] = await dataSource.query<{ exists: boolean }[]>(
      `SELECT to_regclass('barbershop_subscriptions') IS NOT NULL AS exists`,
    );
    expect(exists).toBe(false);

    await dataSource.runMigrations();
    const [{ again }] = await dataSource.query<{ again: boolean }[]>(
      `SELECT to_regclass('barbershop_subscriptions') IS NOT NULL AS again`,
    );
    expect(again).toBe(true);
  });
});

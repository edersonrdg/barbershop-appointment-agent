import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

describe('Services schema (e2e)', () => {
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

  async function insertService(row: {
    barbershopId?: string;
    name?: string;
    priceCents?: number;
    durationMinutes?: number;
  }): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, $4, $5, true, now())`,
      [
        id,
        row.barbershopId ?? barbershopA,
        row.name ?? `Serviço ${id}`,
        row.priceCents ?? 4500,
        row.durationMinutes ?? 30,
      ],
    );
    return id;
  }

  async function countServices(): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM services',
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

  it.each([
    ['price 0', { priceCents: 0 }],
    ['price 1,000,000', { priceCents: 1_000_000 }],
    ['duration 5', { durationMinutes: 5 }],
    ['duration 480', { durationMinutes: 480 }],
  ])('CA-04.4: the database accepts %s', async (_case, row) => {
    await insertService(row);

    expect(await countServices()).toBe(1);
  });

  it.each([
    ['price -1', { priceCents: -1 }],
    ['price 1,000,001', { priceCents: 1_000_001 }],
    ['duration 0', { durationMinutes: 0 }],
    ['duration 4', { durationMinutes: 4 }],
    ['duration 485', { durationMinutes: 485 }],
    ['duration 7', { durationMinutes: 7 }],
  ])(
    'CA-04.4: the database rejects %s with a CHECK violation',
    async (_case, row) => {
      const before = await countServices();

      const insert = insertService(row);

      await expect(insert).rejects.toBeInstanceOf(QueryFailedError);
      await expect(insert).rejects.toMatchObject({
        driverError: { code: CHECK_VIOLATION },
      });
      expect(await countServices()).toBe(before);
    },
  );

  it('CA-04.1: the database rejects "corte" when "Corte" exists in the same barbershop', async () => {
    await insertService({ name: 'Corte' });

    const insert = insertService({ name: 'corte' });

    await expect(insert).rejects.toMatchObject({
      driverError: {
        code: UNIQUE_VIOLATION,
        constraint: 'services_name_unique',
      },
    });
    expect(await countServices()).toBe(1);
  });

  it('CA-04.1: the same name is accepted in another barbershop', async () => {
    await insertService({ name: 'Corte' });

    await insertService({ barbershopId: barbershopB, name: 'Corte' });

    expect(await countServices()).toBe(2);
  });

  it('CA-04.2: the database rejects a service as its own add-on', async () => {
    const serviceId = await insertService({ name: 'Corte' });

    const insert = dataSource.query(
      `INSERT INTO service_add_ons (service_id, add_on_service_id, position) VALUES ($1, $1, 0)`,
      [serviceId],
    );

    await expect(insert).rejects.toMatchObject({
      driverError: { code: CHECK_VIOLATION },
    });
    const [row] = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM service_add_ons',
    );
    expect(Number(row.count)).toBe(0);
  });
});

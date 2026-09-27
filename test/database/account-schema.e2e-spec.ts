import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

async function insertBarbershop(
  dataSource: DataSource,
  id: string,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      'Barbearia Teste',
      'America/Sao_Paulo',
      'trialing',
      new Date(),
      new Date(),
    ],
  );
}

async function insertUser(
  dataSource: DataSource,
  barbershopId: string,
  email: string,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO users (id, barbershop_id, name, email, phone, password_hash, role, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      barbershopId,
      'Dono',
      email,
      '+5511912345678',
      'hash',
      'owner',
      new Date(),
    ],
  );
}

async function countRows(
  dataSource: DataSource,
  table: string,
): Promise<number> {
  const rows = await dataSource.query<Array<{ count: string }>>(
    `SELECT COUNT(*)::int AS count FROM ${table}`,
  );
  return Number(rows[0].count);
}

describe('Account schema (e2e)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('CA-01.3: a second user with the same normalized e-mail violates the unique index (Postgres 23505)', async () => {
    const barbershopId = randomUUID();
    await insertBarbershop(dataSource, barbershopId);
    await insertUser(dataSource, barbershopId, 'dono@barbearia.com');

    await expect(
      insertUser(dataSource, barbershopId, 'dono@barbearia.com'),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('truncateAccountTables leaves barbershops, users and password_reset_tokens empty', async () => {
    const barbershopId = randomUUID();
    await insertBarbershop(dataSource, barbershopId);
    await insertUser(dataSource, barbershopId, 'outro@barbearia.com');

    await truncateAccountTables(dataSource);

    expect(await countRows(dataSource, 'barbershops')).toBe(0);
    expect(await countRows(dataSource, 'users')).toBe(0);
    expect(await countRows(dataSource, 'password_reset_tokens')).toBe(0);
  });
});

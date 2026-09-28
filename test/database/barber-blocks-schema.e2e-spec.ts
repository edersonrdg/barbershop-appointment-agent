import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { AddBarberBlockDetails1790627570253 } from '../../src/infrastructure/database/migrations/1790627570253-AddBarberBlockDetails';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';
const STRING_TOO_LONG = '22001';

interface BlockRow {
  kind: string;
  reason: string | null;
}

describe('Barber blocks schema (e2e)', () => {
  let dataSource: DataSource;
  let barbershopId: string;
  let barberId: string;

  function insertBlock(
    columns: { kind?: string; reason?: string | null },
    runner: DataSource | QueryRunner = dataSource,
  ): Promise<unknown> {
    const names = Object.keys(columns);
    const values = Object.values(columns);
    const extraNames = names.map((name) => `, ${name}`).join('');
    const extraParams = values.map((_, index) => `, $${index + 4}`).join('');
    return runner.query(
      `INSERT INTO barber_blocks (id, barbershop_id, barber_id, starts_at, ends_at, created_at${extraNames})
       VALUES ($1, $2, $3, '2026-10-01T15:00:00Z', '2026-10-01T16:00:00Z', now()${extraParams})`,
      [randomUUID(), barbershopId, barberId, ...values],
    );
  }

  async function storedBlocks(): Promise<BlockRow[]> {
    return dataSource.query<BlockRow[]>(
      'SELECT kind, reason FROM barber_blocks',
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    barbershopId = randomUUID();
    barberId = randomUUID();
    await dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`,
      [barbershopId],
    );
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, 'Ana', NULL, true, now())`,
      [barberId, barbershopId],
    );
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('CA-09.1: the migration turns the blocks saved before it into a block without reason', async () => {
    const migration = new AddBarberBlockDetails1790627570253();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await migration.down(queryRunner);
      await insertBlock({}, queryRunner);

      await migration.up(queryRunner);

      expect(
        await queryRunner.query('SELECT kind, reason FROM barber_blocks'),
      ).toEqual([{ kind: 'block', reason: null }]);
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  });

  it('CA-09.1: the migration reverts without error and removes kind and reason', async () => {
    const migration = new AddBarberBlockDetails1790627570253();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await migration.down(queryRunner);

      const columns = (await queryRunner.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'barber_blocks' AND column_name IN ('kind', 'reason')`,
      )) as unknown[];
      expect(columns).toEqual([]);
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  });

  it.each(['block', 'day_off'])(
    'CA-09.2: accepts kind = %s with a null reason',
    async (kind) => {
      await insertBlock({ kind, reason: null });

      expect(await storedBlocks()).toEqual([{ kind, reason: null }]);
    },
  );

  it('CA-09.1: rejects kind = holiday with the kind CHECK', async () => {
    await expect(insertBlock({ kind: 'holiday' })).rejects.toMatchObject({
      driverError: {
        code: CHECK_VIOLATION,
        constraint: 'barber_blocks_kind_check',
      },
    });
    expect(await storedBlocks()).toEqual([]);
  });

  it('CA-09.1: rejects a block without kind, since the column has no default', async () => {
    await expect(insertBlock({})).rejects.toMatchObject({
      driverError: { code: NOT_NULL_VIOLATION, column: 'kind' },
    });
    expect(await storedBlocks()).toEqual([]);
  });

  it('CA-09.1: accepts a reason with 120 characters', async () => {
    const reason = 'a'.repeat(120);

    await insertBlock({ kind: 'block', reason });

    expect(await storedBlocks()).toEqual([{ kind: 'block', reason }]);
  });

  it('CA-09.1: rejects a reason with 121 characters', async () => {
    await expect(
      insertBlock({ kind: 'block', reason: 'a'.repeat(121) }),
    ).rejects.toMatchObject({ driverError: { code: STRING_TOO_LONG } });
    expect(await storedBlocks()).toEqual([]);
  });
});

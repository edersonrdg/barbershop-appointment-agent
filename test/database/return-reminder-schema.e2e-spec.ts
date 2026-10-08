import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { AddReturnReminder1791465704690 } from '../../src/infrastructure/database/migrations/1791465704690-AddReturnReminder';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';

interface SchemaState {
  consents: boolean;
  askedAt: boolean;
  sentAt: boolean;
}

describe('US-25 return reminder schema (e2e)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  async function state(
    query: (sql: string) => Promise<unknown>,
  ): Promise<SchemaState> {
    const [row] = (await query(
      `SELECT to_regclass('return_reminder_consents') IS NOT NULL AS consents,
              EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'clients'
                         AND column_name = 'return_reminder_asked_at') AS "askedAt",
              EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'appointments'
                         AND column_name = 'return_reminder_sent_at') AS "sentAt"`,
    )) as SchemaState[];
    return row;
  }

  // Reverts this migration itself, not the latest one, so later migrations
  // do not change what is tested.
  it('US-25 door 1 (C22) (f): the migration drops the table and both columns, and creates them again', async () => {
    const migration = new AddReturnReminder1791465704690();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const query = (sql: string) => queryRunner.query(sql);
      await migration.down(queryRunner);
      expect(await state(query)).toEqual({
        consents: false,
        askedAt: false,
        sentAt: false,
      });

      await migration.up(queryRunner);
      expect(await state(query)).toEqual({
        consents: true,
        askedAt: true,
        sentAt: true,
      });
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  });
});

import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';
const NOW = '2026-09-29T15:00:00Z';

describe('WhatsApp conversations schema (e2e)', () => {
  let dataSource: DataSource;
  let barbershopId: string;
  let clientId: string;

  function insertConversation(
    overrides: Record<string, unknown> = {},
  ): Promise<unknown> {
    const row = {
      consecutive_failures: 0,
      paused_at: null,
      pause_reason: null,
      last_activity_at: NOW,
      ...overrides,
    };
    return dataSource.query(
      `INSERT INTO whatsapp_conversations
         (barbershop_id, client_id, consecutive_failures, paused_at, pause_reason, last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        barbershopId,
        clientId,
        row.consecutive_failures,
        row.paused_at,
        row.pause_reason,
        row.last_activity_at,
      ],
    );
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
    clientId = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, 'João', '+5511987654321', now())`,
      [clientId, barbershopId],
    );
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('door 2 (C28): the primary key is (barbershop_id, client_id)', async () => {
    const columns = await dataSource.query<{ column_name: string }[]>(
      `SELECT a.attname AS column_name
         FROM pg_index i
         JOIN pg_attribute a
           ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'whatsapp_conversations'::regclass
          AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)`,
    );

    expect(columns.map((column) => column.column_name)).toEqual([
      'barbershop_id',
      'client_id',
    ]);
  });

  it.each<[string, Record<string, unknown>, string]>([
    [
      'a reason outside the set',
      { paused_at: NOW, pause_reason: 'bored' },
      CHECK_VIOLATION,
    ],
    ['a pause without a reason', { paused_at: NOW }, CHECK_VIOLATION],
    [
      'a reason without a pause',
      { pause_reason: 'requested' },
      CHECK_VIOLATION,
    ],
    ['negative failures', { consecutive_failures: -1 }, CHECK_VIOLATION],
    ['no last activity', { last_activity_at: null }, NOT_NULL_VIOLATION],
  ])('door 2 (C28): refuses %s', async (_case, overrides, code) => {
    await expect(insertConversation(overrides)).rejects.toMatchObject({
      driverError: { code },
    });
  });

  it('door 2 (C28): refuses a second conversation of the same client', async () => {
    await insertConversation();

    await expect(insertConversation()).rejects.toMatchObject({
      driverError: { code: UNIQUE_VIOLATION },
    });
  });

  it('door 2 (C28): accepts both reasons and deleting the client deletes the conversation', async () => {
    await insertConversation({
      paused_at: NOW,
      pause_reason: 'not_understood',
    });
    await dataSource.query(
      `UPDATE whatsapp_conversations SET pause_reason = 'requested'`,
    );

    await dataSource.query('DELETE FROM clients WHERE id = $1', [clientId]);

    const rows = await dataSource.query<unknown[]>(
      'SELECT 1 FROM whatsapp_conversations',
    );
    expect(rows).toHaveLength(0);
  });
});

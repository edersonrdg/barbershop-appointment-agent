import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const TOKEN_HASH = 'a'.repeat(64);

describe('Invitation schema (e2e)', () => {
  let dataSource: DataSource;
  let barbershopId: string;

  async function insertInvitation(email: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO user_invitations (id, barbershop_id, email, name, token_hash, expires_at, accepted_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)`,
      [
        randomUUID(),
        barbershopId,
        email,
        'João',
        TOKEN_HASH,
        new Date(),
        new Date(),
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
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('CA-02.1: token_hash is unique through user_invitations_token_hash_unique (C14)', async () => {
    const [index] = await dataSource.query<{ indexdef: string }[]>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'user_invitations_token_hash_unique'",
    );
    expect(index.indexdef).toContain('CREATE UNIQUE INDEX');
    expect(index.indexdef).toContain('(token_hash)');

    await insertInvitation('um@exemplo.com');
    const duplicate = insertInvitation('outro@exemplo.com');

    await expect(duplicate).rejects.toBeInstanceOf(QueryFailedError);
    await expect(duplicate).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
  });

  it('CA-02.1: users.phone accepts NULL for a barber (C14)', async () => {
    await dataSource.query(
      `INSERT INTO users (id, barbershop_id, name, email, phone, password_hash, role, created_at)
       VALUES ($1, $2, 'João', 'joao@exemplo.com', NULL, 'hash', 'barber', now())`,
      [randomUUID(), barbershopId],
    );

    const [row] = await dataSource.query<{ phone: string | null }[]>(
      'SELECT phone FROM users',
    );
    expect(row.phone).toBeNull();
  });
});

import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Barbershop } from '../../src/domain/entities/barbershop';
import { User } from '../../src/domain/entities/user';
import { EmailAlreadyRegisteredError } from '../../src/domain/errors/email-already-registered.error';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmBarbershopRepository } from '../../src/infrastructure/database/repositories/typeorm-barbershop.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function buildBarbershop(name = 'Barbearia do Zé'): Barbershop {
  return Barbershop.startTrial({ id: randomUUID(), name, now: NOW });
}

function buildOwner(barbershopId: string, email: string): User {
  return User.createOwner({
    id: randomUUID(),
    barbershopId,
    name: 'José da Silva',
    email,
    phone: '+5511912345678',
    passwordHash: 'scrypt$16384$8$1$salt$hash',
    now: NOW,
  });
}

async function countRows(
  dataSource: DataSource,
  table: 'barbershops' | 'users',
): Promise<number> {
  const rows = await dataSource.query<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM ${table}`,
  );
  return rows[0].count;
}

describe('TypeOrmBarbershopRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmBarbershopRepository;

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmBarbershopRepository(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('CA-01.1: persists the barbershop and its owner and reads the barbershop back with every field', async () => {
    const barbershop = buildBarbershop();
    const owner = buildOwner(barbershop.id, 'dono@barbearia.com');

    await repository.createWithOwner(barbershop, owner);

    const found = await repository.findById(barbershop.id);
    expect(found).toBeInstanceOf(Barbershop);
    expect(found?.id).toBe(barbershop.id);
    expect(found?.name).toBe('Barbearia do Zé');
    expect(found?.timezone).toBe('America/Sao_Paulo');
    expect(found?.subscriptionStatus).toBe('trialing');
    expect(found?.trialEndsAt.toISOString()).toBe('2026-10-11T12:00:00.000Z');
    expect(found?.createdAt.toISOString()).toBe('2026-09-27T12:00:00.000Z');

    const users = await dataSource.query<
      Array<{
        id: string;
        barbershop_id: string;
        name: string;
        email: string;
        phone: string;
        password_hash: string;
        role: string;
        created_at: Date;
      }>
    >('SELECT * FROM users');
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(owner.id);
    expect(users[0].barbershop_id).toBe(barbershop.id);
    expect(users[0].name).toBe('José da Silva');
    expect(users[0].email).toBe('dono@barbearia.com');
    expect(users[0].phone).toBe('+5511912345678');
    expect(users[0].password_hash).toBe('scrypt$16384$8$1$salt$hash');
    expect(users[0].role).toBe('owner');
    expect(users[0].created_at.toISOString()).toBe('2026-09-27T12:00:00.000Z');
  });

  it('CA-01.1: findById returns null for an unknown barbershop', async () => {
    expect(await repository.findById(randomUUID())).toBeNull();
  });

  it('CA-01.3: a repeated e-mail throws EmailAlreadyRegisteredError and the second barbershop is not persisted', async () => {
    const first = buildBarbershop('Primeira');
    await repository.createWithOwner(
      first,
      buildOwner(first.id, 'dono@barbearia.com'),
    );
    const second = buildBarbershop('Segunda');

    await expect(
      repository.createWithOwner(
        second,
        buildOwner(second.id, 'dono@barbearia.com'),
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

    expect(await repository.findById(second.id)).toBeNull();
    expect(await countRows(dataSource, 'barbershops')).toBe(1);
    expect(await countRows(dataSource, 'users')).toBe(1);
  });

  it('CA-01.3: two concurrent createWithOwner with the same e-mail yield one success, one EmailAlreadyRegisteredError and a single barbershop', async () => {
    const first = buildBarbershop('Primeira');
    const second = buildBarbershop('Segunda');

    const results = await Promise.allSettled([
      repository.createWithOwner(
        first,
        buildOwner(first.id, 'dono@barbearia.com'),
      ),
      repository.createWithOwner(
        second,
        buildOwner(second.id, 'dono@barbearia.com'),
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(await countRows(dataSource, 'barbershops')).toBe(1);
    expect(await countRows(dataSource, 'users')).toBe(1);
  });
});

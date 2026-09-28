import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Barbershop } from '../../src/domain/entities/barbershop';
import { PasswordResetToken } from '../../src/domain/entities/password-reset-token';
import { User } from '../../src/domain/entities/user';
import { BookingRules } from '../../src/domain/value-objects/booking-rules';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmBarbershopRepository } from '../../src/infrastructure/database/repositories/typeorm-barbershop.repository';
import { TypeOrmPasswordResetRepository } from '../../src/infrastructure/database/repositories/typeorm-password-reset.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const USED_AT = new Date('2026-09-27T12:30:00.000Z');
const ORIGINAL_HASH = 'scrypt$16384$8$1$salt$original';

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe('TypeOrmPasswordResetRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmPasswordResetRepository;
  let barbershopRepository: TypeOrmBarbershopRepository;

  async function createOwner(email: string): Promise<User> {
    const barbershop = Barbershop.startTrial({
      id: randomUUID(),
      name: 'Barbearia',
      now: NOW,
    });
    const owner = User.createOwner({
      id: randomUUID(),
      barbershopId: barbershop.id,
      name: 'José da Silva',
      email,
      phone: '+5511912345678',
      passwordHash: ORIGINAL_HASH,
      now: NOW,
    });
    await barbershopRepository.createWithOwner(
      barbershop,
      owner,
      BookingRules.defaults(),
    );
    return owner;
  }

  function issueToken(
    userId: string,
    barbershopId: string,
    token: string,
  ): PasswordResetToken {
    return PasswordResetToken.issue({
      id: randomUUID(),
      userId,
      barbershopId,
      tokenHash: hashOf(token),
      now: NOW,
    });
  }

  async function passwordHashOf(userId: string): Promise<string> {
    const rows = await dataSource.query<Array<{ password_hash: string }>>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    return rows[0].password_hash;
  }

  async function usedAtOf(tokenId: string): Promise<Date | null> {
    const rows = await dataSource.query<Array<{ used_at: Date | null }>>(
      'SELECT used_at FROM password_reset_tokens WHERE id = $1',
      [tokenId],
    );
    return rows[0].used_at;
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmPasswordResetRepository(dataSource);
    barbershopRepository = new TypeOrmBarbershopRepository(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('CA-01.5: replaceForUser stores the token and findByTokenHash reads it back with every field', async () => {
    const owner = await createOwner('dono@barbearia.com');
    const token = issueToken(owner.id, owner.barbershopId, 'token-1');

    await repository.replaceForUser(token);

    const found = await repository.findByTokenHash(hashOf('token-1'));
    expect(found).toBeInstanceOf(PasswordResetToken);
    expect(found?.id).toBe(token.id);
    expect(found?.userId).toBe(owner.id);
    expect(found?.barbershopId).toBe(owner.barbershopId);
    expect(found?.tokenHash).toBe(hashOf('token-1'));
    expect(found?.expiresAt.toISOString()).toBe('2026-09-27T13:00:00.000Z');
    expect(found?.usedAt).toBeNull();
    expect(found?.createdAt.toISOString()).toBe('2026-09-27T12:00:00.000Z');
  });

  it('CA-01.5: replaceForUser deletes the previous unused token of the user', async () => {
    const owner = await createOwner('dono@barbearia.com');
    const other = await createOwner('outro@barbearia.com');
    await repository.replaceForUser(
      issueToken(owner.id, owner.barbershopId, 'old'),
    );
    await repository.replaceForUser(
      issueToken(other.id, other.barbershopId, 'other-user'),
    );

    await repository.replaceForUser(
      issueToken(owner.id, owner.barbershopId, 'new'),
    );

    expect(await repository.findByTokenHash(hashOf('old'))).toBeNull();
    expect((await repository.findByTokenHash(hashOf('new')))?.userId).toBe(
      owner.id,
    );
    expect(
      (await repository.findByTokenHash(hashOf('other-user')))?.userId,
    ).toBe(other.id);
  });

  it('CA-01.5: findByTokenHash returns null for an unknown hash', async () => {
    expect(await repository.findByTokenHash(hashOf('missing'))).toBeNull();
  });

  it('CA-01.5: redeem swaps the password hash and marks used_at; a second redeem of the same token returns false and keeps the password', async () => {
    const owner = await createOwner('dono@barbearia.com');
    const token = issueToken(owner.id, owner.barbershopId, 'token-1');
    await repository.replaceForUser(token);

    const first = await repository.redeem({
      barbershopId: owner.barbershopId,
      userId: owner.id,
      tokenId: token.id,
      passwordHash: 'scrypt$16384$8$1$salt$new',
      usedAt: USED_AT,
    });

    expect(first).toBe(true);
    expect(await passwordHashOf(owner.id)).toBe('scrypt$16384$8$1$salt$new');
    expect((await usedAtOf(token.id))?.toISOString()).toBe(
      '2026-09-27T12:30:00.000Z',
    );

    const second = await repository.redeem({
      barbershopId: owner.barbershopId,
      userId: owner.id,
      tokenId: token.id,
      passwordHash: 'scrypt$16384$8$1$salt$second',
      usedAt: new Date('2026-09-27T12:40:00.000Z'),
    });

    expect(second).toBe(false);
    expect(await passwordHashOf(owner.id)).toBe('scrypt$16384$8$1$salt$new');
    expect((await usedAtOf(token.id))?.toISOString()).toBe(
      '2026-09-27T12:30:00.000Z',
    );
  });

  it('CA-01.4: redeem with the barbershopId of another tenant returns false and keeps the password', async () => {
    const owner = await createOwner('dono@barbearia.com');
    const other = await createOwner('outro@barbearia.com');
    const token = issueToken(owner.id, owner.barbershopId, 'token-1');
    await repository.replaceForUser(token);

    const redeemed = await repository.redeem({
      barbershopId: other.barbershopId,
      userId: owner.id,
      tokenId: token.id,
      passwordHash: 'scrypt$16384$8$1$salt$new',
      usedAt: USED_AT,
    });

    expect(redeemed).toBe(false);
    expect(await passwordHashOf(owner.id)).toBe(ORIGINAL_HASH);
    expect(await usedAtOf(token.id)).toBeNull();
  });

  it('CA-01.4: redeem rolls back the token when the user is not in the token tenant', async () => {
    const owner = await createOwner('dono@barbearia.com');
    const other = await createOwner('outro@barbearia.com');
    const token = issueToken(owner.id, other.barbershopId, 'token-1');
    await repository.replaceForUser(token);

    const redeemed = await repository.redeem({
      barbershopId: other.barbershopId,
      userId: owner.id,
      tokenId: token.id,
      passwordHash: 'scrypt$16384$8$1$salt$new',
      usedAt: USED_AT,
    });

    expect(redeemed).toBe(false);
    expect(await passwordHashOf(owner.id)).toBe(ORIGINAL_HASH);
    expect(await usedAtOf(token.id)).toBeNull();
  });
});

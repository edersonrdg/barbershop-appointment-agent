import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Barbershop } from '../../src/domain/entities/barbershop';
import { User } from '../../src/domain/entities/user';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmBarbershopRepository } from '../../src/infrastructure/database/repositories/typeorm-barbershop.repository';
import { TypeOrmUserRepository } from '../../src/infrastructure/database/repositories/typeorm-user.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-09-27T12:00:00.000Z');

describe('TypeOrmUserRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmUserRepository;
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
      passwordHash: 'scrypt$16384$8$1$salt$hash',
      now: NOW,
    });
    await barbershopRepository.createWithOwner(barbershop, owner);
    return owner;
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmUserRepository(dataSource);
    barbershopRepository = new TypeOrmBarbershopRepository(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('CA-01.4: findById returns the user only inside its own barbershop', async () => {
    const ownerA = await createOwner('dono-a@barbearia.com');
    const ownerB = await createOwner('dono-b@barbearia.com');

    expect(
      await repository.findById(ownerB.barbershopId, ownerA.id),
    ).toBeNull();

    const found = await repository.findById(ownerA.barbershopId, ownerA.id);
    expect(found).toBeInstanceOf(User);
    expect(found?.id).toBe(ownerA.id);
    expect(found?.barbershopId).toBe(ownerA.barbershopId);
    expect(found?.name).toBe('José da Silva');
    expect(found?.email).toBe('dono-a@barbearia.com');
    expect(found?.phone).toBe('+5511912345678');
    expect(found?.passwordHash).toBe('scrypt$16384$8$1$salt$hash');
    expect(found?.role).toBe('owner');
    expect(found?.createdAt.toISOString()).toBe('2026-09-27T12:00:00.000Z');
  });

  it('findByEmail finds the user by the normalized e-mail and returns its barbershopId', async () => {
    const ownerA = await createOwner('dono-a@barbearia.com');
    await createOwner('dono-b@barbearia.com');

    const found = await repository.findByEmail('dono-a@barbearia.com');

    expect(found?.id).toBe(ownerA.id);
    expect(found?.barbershopId).toBe(ownerA.barbershopId);
    expect(found?.passwordHash).toBe('scrypt$16384$8$1$salt$hash');
  });

  it('findByEmail returns null for an unknown e-mail', async () => {
    await createOwner('dono-a@barbearia.com');

    expect(await repository.findByEmail('outro@barbearia.com')).toBeNull();
  });
});

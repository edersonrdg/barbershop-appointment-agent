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

  async function insertBarber(
    barbershopId: string,
    email: string,
    createdAt: Date,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO users (id, barbershop_id, name, email, phone, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, NULL, $5, 'barber', $6)`,
      [id, barbershopId, 'Barbeiro', email, 'hash', createdAt],
    );
    return id;
  }

  async function userIds(): Promise<string[]> {
    const rows = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM users',
    );
    return rows.map((row) => row.id).sort();
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

  it('CA-02.3: listByBarbershop returns only the barbershop users, oldest first (C30)', async () => {
    const ownerA = await createOwner('dono-a@barbearia.com');
    const ownerB = await createOwner('dono-b@barbearia.com');
    const later = new Date(NOW.getTime() + 60_000);
    const earlier = new Date(NOW.getTime() - 60_000);
    const barberLater = await insertBarber(
      ownerA.barbershopId,
      'barbeiro-1@exemplo.com',
      later,
    );
    const barberEarlier = await insertBarber(
      ownerA.barbershopId,
      'barbeiro-2@exemplo.com',
      earlier,
    );
    await insertBarber(ownerB.barbershopId, 'barbeiro-b@exemplo.com', NOW);

    const users = await repository.listByBarbershop(ownerA.barbershopId);

    expect(users.map((user) => user.id)).toEqual([
      barberEarlier,
      ownerA.id,
      barberLater,
    ]);
    expect(users[0].role).toBe('barber');
    expect(users[0].phone).toBeNull();
  });

  it('CA-02.3: removeBarber deletes a barber of the barbershop but never an owner or a user of another barbershop (C30)', async () => {
    const ownerA = await createOwner('dono-a@barbearia.com');
    const ownerB = await createOwner('dono-b@barbearia.com');
    const barberA = await insertBarber(
      ownerA.barbershopId,
      'barbeiro-a@exemplo.com',
      NOW,
    );
    const barberB = await insertBarber(
      ownerB.barbershopId,
      'barbeiro-b@exemplo.com',
      NOW,
    );
    const before = await userIds();

    expect(await repository.removeBarber(ownerA.barbershopId, ownerA.id)).toBe(
      false,
    );
    expect(await repository.removeBarber(ownerA.barbershopId, barberB)).toBe(
      false,
    );
    expect(await userIds()).toEqual(before);

    expect(await repository.removeBarber(ownerA.barbershopId, barberA)).toBe(
      true,
    );
    expect(await userIds()).toEqual(before.filter((id) => id !== barberA));
  });
});

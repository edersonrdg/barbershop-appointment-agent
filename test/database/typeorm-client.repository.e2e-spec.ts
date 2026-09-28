import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmClientRepository } from '../../src/infrastructure/database/repositories/typeorm-client.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const CREATED_AT = new Date('2026-09-28T12:00:00.000Z');
const PHONE = '+5511987654321';

describe('TypeOrmClientRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmClientRepository;
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

  async function insertClient(
    barbershopId: string,
    name: string,
    phone: string,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, barbershopId, name, phone, CREATED_AT],
    );
    return id;
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmClientRepository(dataSource);
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

  describe('findByPhone', () => {
    it('CA-10.2: returns the client of the barbershop with the E.164 phone', async () => {
      const id = await insertClient(barbershopA, 'João', PHONE);
      await insertClient(barbershopA, 'Maria', '+5511912345678');

      const client = await repository.findByPhone(barbershopA, PHONE);

      expect(client).not.toBeNull();
      expect({
        id: client?.id,
        barbershopId: client?.barbershopId,
        name: client?.name,
        phone: client?.phone,
        createdAt: client?.createdAt,
      }).toEqual({
        id,
        barbershopId: barbershopA,
        name: 'João',
        phone: PHONE,
        createdAt: CREATED_AT,
      });
    });

    it('CA-10.2 / RN-26: returns null for a phone that belongs only to another barbershop', async () => {
      await insertClient(barbershopB, 'João', PHONE);

      expect(await repository.findByPhone(barbershopA, PHONE)).toBeNull();
    });

    it('CA-10.2: returns null for an unknown phone', async () => {
      await insertClient(barbershopA, 'João', PHONE);

      expect(
        await repository.findByPhone(barbershopA, '+5511912345678'),
      ).toBeNull();
    });
  });
});

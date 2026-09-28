import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmBarberBlockRepository } from '../../src/infrastructure/database/repositories/typeorm-barber-block.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const RANGE = {
  start: new Date('2026-10-05T12:00:00.000Z'),
  end: new Date('2026-10-05T18:00:00.000Z'),
};

describe('TypeOrmBarberBlockRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmBarberBlockRepository;
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

  async function insertBarber(barbershopId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, NULL, true, now())`,
      [id, barbershopId, `Barbeiro ${id}`],
    );
    return id;
  }

  async function insertBlock(
    barbershopId: string,
    barberId: string,
    startsAt: string,
    endsAt: string,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO barber_blocks (id, barbershop_id, barber_id, kind, starts_at, ends_at, created_at)
       VALUES ($1, $2, $3, 'block', $4, $5, now())`,
      [randomUUID(), barbershopId, barberId, startsAt, endsAt],
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmBarberBlockRepository(dataSource);
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

  it('CA-07.1: returns only the blocks of the requested barbers that overlap the range; touching ones are left out', async () => {
    const ana = await insertBarber(barbershopA);
    const bruno = await insertBarber(barbershopA);
    const caio = await insertBarber(barbershopA);
    await insertBlock(
      barbershopA,
      ana,
      '2026-10-05T11:00:00Z',
      '2026-10-05T12:00:00Z',
    );
    await insertBlock(
      barbershopA,
      ana,
      '2026-10-05T11:30:00Z',
      '2026-10-05T12:01:00Z',
    );
    await insertBlock(
      barbershopA,
      ana,
      '2026-10-05T14:00:00Z',
      '2026-10-05T15:00:00Z',
    );
    await insertBlock(
      barbershopA,
      bruno,
      '2026-10-05T17:59:00Z',
      '2026-10-05T19:00:00Z',
    );
    await insertBlock(
      barbershopA,
      bruno,
      '2026-10-05T18:00:00Z',
      '2026-10-05T19:00:00Z',
    );
    await insertBlock(
      barbershopA,
      caio,
      '2026-10-05T14:00:00Z',
      '2026-10-05T15:00:00Z',
    );

    const periods = await repository.listBusyPeriods(
      barbershopA,
      [ana, bruno],
      RANGE,
    );

    expect(periods).toEqual([
      {
        barberId: ana,
        start: new Date('2026-10-05T11:30:00.000Z'),
        end: new Date('2026-10-05T12:01:00.000Z'),
      },
      {
        barberId: ana,
        start: new Date('2026-10-05T14:00:00.000Z'),
        end: new Date('2026-10-05T15:00:00.000Z'),
      },
      {
        barberId: bruno,
        start: new Date('2026-10-05T17:59:00.000Z'),
        end: new Date('2026-10-05T19:00:00.000Z'),
      },
    ]);
  });

  it('RN-26: does not return a block of another barbershop queried by its barber id with the wrong tenant', async () => {
    const foreignBarber = await insertBarber(barbershopB);
    await insertBlock(
      barbershopB,
      foreignBarber,
      '2026-10-05T14:00:00Z',
      '2026-10-05T15:00:00Z',
    );

    const periods = await repository.listBusyPeriods(
      barbershopA,
      [foreignBarber],
      RANGE,
    );

    expect(periods).toEqual([]);
    expect(
      await repository.listBusyPeriods(barbershopB, [foreignBarber], RANGE),
    ).toHaveLength(1);
  });
});

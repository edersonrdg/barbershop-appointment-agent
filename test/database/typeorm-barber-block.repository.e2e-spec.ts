import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  BarberBlock,
  BarberBlockKind,
} from '../../src/domain/entities/barber-block';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmBarberBlockRepository } from '../../src/infrastructure/database/repositories/typeorm-barber-block.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-09-28T12:00:00.000Z');
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

  async function insertBarber(
    barbershopId: string,
    name?: string,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, NULL, true, now())`,
      [id, barbershopId, name ?? `Barbeiro ${id}`],
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

  async function createBlock(
    barbershopId: string,
    barberId: string,
    startsAt: string,
    endsAt: string,
    options: {
      kind?: BarberBlockKind;
      reason?: string | null;
      id?: string;
    } = {},
  ): Promise<BarberBlock> {
    const block = BarberBlock.create({
      id: options.id ?? randomUUID(),
      barbershopId,
      barberId,
      kind: options.kind ?? 'block',
      period: { start: new Date(startsAt), end: new Date(endsAt) },
      reason: options.reason ?? null,
      now: NOW,
    });
    await repository.create(block);
    return block;
  }

  function describeBlock(block: BarberBlock | null) {
    return (
      block && {
        id: block.id,
        barbershopId: block.barbershopId,
        barberId: block.barberId,
        kind: block.kind,
        startsAt: block.startsAt.toISOString(),
        endsAt: block.endsAt.toISOString(),
        reason: block.reason,
        createdAt: block.createdAt.toISOString(),
      }
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

  describe('create and findById', () => {
    it('CA-09.2: stores the kind, the UTC period and the reason and restores them', async () => {
      const ana = await insertBarber(barbershopA);
      const block = await createBlock(
        barbershopA,
        ana,
        '2026-10-01T03:00:00Z',
        '2026-10-02T03:00:00Z',
        { kind: 'day_off', reason: 'Consulta médica' },
      );

      const found = await repository.findById(barbershopA, block.id);

      expect(describeBlock(found)).toEqual({
        id: block.id,
        barbershopId: barbershopA,
        barberId: ana,
        kind: 'day_off',
        startsAt: '2026-10-01T03:00:00.000Z',
        endsAt: '2026-10-02T03:00:00.000Z',
        reason: 'Consulta médica',
        createdAt: NOW.toISOString(),
      });
    });

    it('CA-09.1: stores a block without reason as null', async () => {
      const ana = await insertBarber(barbershopA);
      const block = await createBlock(
        barbershopA,
        ana,
        '2026-10-01T15:00:00Z',
        '2026-10-01T16:00:00Z',
      );

      const found = await repository.findById(barbershopA, block.id);

      expect(found?.kind).toBe('block');
      expect(found?.reason).toBeNull();
    });

    it('RN-26: does not find a block of another barbershop', async () => {
      const ana = await insertBarber(barbershopA);
      const block = await createBlock(
        barbershopA,
        ana,
        '2026-10-01T15:00:00Z',
        '2026-10-01T16:00:00Z',
      );

      expect(await repository.findById(barbershopB, block.id)).toBeNull();
    });

    it('CA-09.1: a created block is a busy period for the availability engine (RN-05)', async () => {
      const ana = await insertBarber(barbershopA);
      await createBlock(
        barbershopA,
        ana,
        '2026-10-05T14:00:00Z',
        '2026-10-05T15:00:00Z',
      );

      expect(
        await repository.listBusyPeriods(barbershopA, [ana], RANGE),
      ).toEqual([
        {
          barberId: ana,
          start: new Date('2026-10-05T14:00:00.000Z'),
          end: new Date('2026-10-05T15:00:00.000Z'),
        },
      ]);
    });
  });

  describe('delete', () => {
    it('RN-26: deletes the block only in the given barbershop', async () => {
      const ana = await insertBarber(barbershopA);
      const block = await createBlock(
        barbershopA,
        ana,
        '2026-10-01T15:00:00Z',
        '2026-10-01T16:00:00Z',
      );

      await repository.delete(barbershopB, block.id);
      expect(await repository.findById(barbershopA, block.id)).not.toBeNull();

      await repository.delete(barbershopA, block.id);
      expect(await repository.findById(barbershopA, block.id)).toBeNull();
    });
  });

  describe('listStartingIn', () => {
    it('CA-09.1: lists the blocks starting in the range by start, case-insensitive barber name and id', async () => {
      const bruno = await insertBarber(barbershopA, 'bruno');
      const carla = await insertBarber(barbershopA, 'Carla');
      const [firstId, secondId] = [randomUUID(), randomUUID()].sort();
      await createBlock(
        barbershopA,
        bruno,
        '2026-10-05T11:00:00Z',
        '2026-10-05T13:00:00Z',
      );
      await createBlock(
        barbershopA,
        carla,
        '2026-10-05T18:00:00Z',
        '2026-10-05T19:00:00Z',
      );
      await createBlock(
        barbershopA,
        carla,
        '2026-10-05T14:00:00Z',
        '2026-10-05T15:00:00Z',
        { reason: 'Almoço' },
      );
      await createBlock(
        barbershopA,
        bruno,
        '2026-10-05T14:00:00Z',
        '2026-10-05T14:30:00Z',
      );
      await createBlock(
        barbershopA,
        carla,
        '2026-10-05T16:00:00Z',
        '2026-10-05T17:00:00Z',
        { id: secondId },
      );
      await createBlock(
        barbershopA,
        carla,
        '2026-10-05T16:00:00Z',
        '2026-10-05T16:30:00Z',
        { id: firstId },
      );
      await createBlock(
        barbershopA,
        bruno,
        '2026-10-05T12:00:00Z',
        '2026-10-06T03:00:00Z',
        { kind: 'day_off' },
      );

      const views = await repository.listStartingIn(barbershopA, RANGE, null);

      expect(
        views.map((view) => ({
          ...view,
          startsAt: view.startsAt.toISOString(),
          endsAt: view.endsAt.toISOString(),
        })),
      ).toEqual([
        {
          id: expect.any(String) as string,
          barber: { id: bruno, name: 'bruno' },
          kind: 'day_off',
          startsAt: '2026-10-05T12:00:00.000Z',
          endsAt: '2026-10-06T03:00:00.000Z',
          reason: null,
        },
        {
          id: expect.any(String) as string,
          barber: { id: bruno, name: 'bruno' },
          kind: 'block',
          startsAt: '2026-10-05T14:00:00.000Z',
          endsAt: '2026-10-05T14:30:00.000Z',
          reason: null,
        },
        {
          id: expect.any(String) as string,
          barber: { id: carla, name: 'Carla' },
          kind: 'block',
          startsAt: '2026-10-05T14:00:00.000Z',
          endsAt: '2026-10-05T15:00:00.000Z',
          reason: 'Almoço',
        },
        {
          id: firstId,
          barber: { id: carla, name: 'Carla' },
          kind: 'block',
          startsAt: '2026-10-05T16:00:00.000Z',
          endsAt: '2026-10-05T16:30:00.000Z',
          reason: null,
        },
        {
          id: secondId,
          barber: { id: carla, name: 'Carla' },
          kind: 'block',
          startsAt: '2026-10-05T16:00:00.000Z',
          endsAt: '2026-10-05T17:00:00.000Z',
          reason: null,
        },
      ]);
    });

    it('CA-09.1: filters by barber when one is given', async () => {
      const ana = await insertBarber(barbershopA, 'Ana');
      const bruno = await insertBarber(barbershopA, 'Bruno');
      await createBlock(
        barbershopA,
        ana,
        '2026-10-05T14:00:00Z',
        '2026-10-05T15:00:00Z',
      );
      await createBlock(
        barbershopA,
        bruno,
        '2026-10-05T14:00:00Z',
        '2026-10-05T15:00:00Z',
      );

      const views = await repository.listStartingIn(barbershopA, RANGE, bruno);

      expect(views.map((view) => view.barber)).toEqual([
        { id: bruno, name: 'Bruno' },
      ]);
    });

    it('RN-26: leaves out the blocks of another barbershop', async () => {
      const ana = await insertBarber(barbershopA, 'Ana');
      const foreignBarber = await insertBarber(barbershopB, 'Zeca');
      await createBlock(
        barbershopA,
        ana,
        '2026-10-05T14:00:00Z',
        '2026-10-05T15:00:00Z',
      );
      await createBlock(
        barbershopB,
        foreignBarber,
        '2026-10-05T14:00:00Z',
        '2026-10-05T15:00:00Z',
      );

      expect(
        (await repository.listStartingIn(barbershopA, RANGE, null)).map(
          (view) => view.barber.id,
        ),
      ).toEqual([ana]);
      expect(
        await repository.listStartingIn(barbershopA, RANGE, foreignBarber),
      ).toEqual([]);
    });
  });
});

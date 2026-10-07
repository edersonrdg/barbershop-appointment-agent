import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { WaitlistEntry } from '../../src/domain/entities/waitlist-entry';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmWaitlistRepository } from '../../src/infrastructure/database/repositories/typeorm-waitlist.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { WaitlistOffer } from '../../src/usecases/ports/waitlist.repository.port';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-09-29T15:00:00.000Z');
const FREED_AT = new Date('2026-09-30T18:00:00.000Z');

describe('TypeOrmWaitlistRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmWaitlistRepository;
  let shop: string;
  let otherShop: string;
  let corte: string;
  let joao: string;

  async function insertShop(): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`,
      [id],
    );
    return id;
  }

  async function insertClient(barbershopId = shop): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, 'Cliente', $3, now())`,
      [id, barbershopId, `+55119${Math.floor(Math.random() * 1e8)}`],
    );
    return id;
  }

  async function insertService(barbershopId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, 4500, 30, true, now())`,
      [id, barbershopId, `Corte ${id}`],
    );
    return id;
  }

  async function freed(): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, NULL, $4, $5, 'cancelled', 'bot', now())`,
      [id, shop, joao, FREED_AT, new Date(FREED_AT.getTime() + 30 * 60_000)],
    );
    return id;
  }

  function entry(
    clientId: string,
    overrides: Partial<{
      id: string;
      barbershopId: string;
      serviceIds: string[];
      period: 'morning' | 'afternoon' | 'evening' | null;
      createdAt: Date;
    }> = {},
  ): WaitlistEntry {
    return WaitlistEntry.create({
      id: randomUUID(),
      barbershopId: shop,
      clientId,
      serviceIds: [corte],
      barberId: null,
      startsOn: '2026-09-30',
      endsOn: '2026-09-30',
      period: 'afternoon',
      createdAt: NOW,
      ...overrides,
    });
  }

  function offer(entryId: string, appointmentId: string): WaitlistOffer {
    return {
      id: randomUUID(),
      barbershopId: shop,
      entryId,
      appointmentId,
      barberId: joao,
      startsAt: FREED_AT,
      expiresAt: new Date(NOW.getTime() + 15 * 60_000),
      status: 'pending',
    };
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmWaitlistRepository(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    shop = await insertShop();
    otherShop = await insertShop();
    corte = await insertService(shop);
    joao = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, 'João', NULL, true, now())`,
      [joao, shop],
    );
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  describe('US-24 door 1', () => {
    it('US-24 door 1 (C29) (a): a second entry of the client replaces the first', async () => {
      const client = await insertClient();
      await repository.join(entry(client, { period: 'morning' }));
      const second = entry(client, {
        createdAt: new Date(NOW.getTime() + 600_000),
      });
      await repository.join(second);

      const entries = await repository.listEntries(shop);
      expect(entries.map((stored) => [stored.id, stored.period])).toEqual([
        [second.id, 'afternoon'],
      ]);
      expect(entries[0].serviceIds).toEqual([corte]);
      expect(entries[0].createdAt).toEqual(second.createdAt);
    });

    it('US-24 door 1 (C29) (b): a second pending offer of the same slot is not stored', async () => {
      const first = entry(await insertClient());
      const second = entry(await insertClient());
      await repository.join(first);
      await repository.join(second);
      const slot = await freed();

      await expect(repository.createOffer(offer(first.id, slot))).resolves.toBe(
        true,
      );
      await expect(
        repository.createOffer(offer(second.id, slot)),
      ).resolves.toBe(false);
    });

    it('US-24 door 1 (C29) (c): a second pending offer to the same entry is not stored', async () => {
      const waiting = entry(await insertClient());
      await repository.join(waiting);

      await expect(
        repository.createOffer(offer(waiting.id, await freed())),
      ).resolves.toBe(true);
      await expect(
        repository.createOffer(offer(waiting.id, await freed())),
      ).resolves.toBe(false);
    });

    it('US-24 door 1 (C29) (d): an entry never gets the same slot twice, even after declining it', async () => {
      const waiting = entry(await insertClient());
      await repository.join(waiting);
      const slot = await freed();
      const first = offer(waiting.id, slot);
      await repository.createOffer(first);
      await repository.resolveOffer(shop, first.id, 'declined', NOW);

      await expect(
        repository.createOffer(offer(waiting.id, slot)),
      ).resolves.toBe(false);
    });

    it('US-24 door 1 (C29) (e): the status check refuses an unknown status', async () => {
      const waiting = entry(await insertClient());
      await repository.join(waiting);

      await expect(
        repository.createOffer({
          ...offer(waiting.id, await freed()),
          status: 'other' as WaitlistOffer['status'],
        }),
      ).rejects.toThrow(/waitlist_offers_status_check/);
    });

    it('US-24 door 1 (C29) (f): removing the entry removes its offers', async () => {
      const waiting = entry(await insertClient());
      await repository.join(waiting);
      await repository.createOffer(offer(waiting.id, await freed()));

      await repository.removeEntry(shop, waiting.id);

      await expect(repository.listEntries(shop)).resolves.toEqual([]);
      await expect(repository.listOffers(shop)).resolves.toEqual([]);
    });

    it('US-24 door 1 (C29) (g): reads only the queue of the barbershop', async () => {
      const otherService = await insertService(otherShop);
      await repository.join(
        entry(await insertClient(otherShop), {
          barbershopId: otherShop,
          serviceIds: [otherService],
        }),
      );
      const mine = entry(await insertClient());
      await repository.join(mine);

      const entries = await repository.listEntries(shop);
      expect(entries.map((stored) => stored.id)).toEqual([mine.id]);
      await expect(repository.removeEntry(otherShop, mine.id)).resolves.toBe(
        undefined,
      );
      await expect(repository.listEntries(shop)).resolves.toHaveLength(1);
    });

    it('US-24 (C29): accepts only before the deadline, and expires pending offers at it', async () => {
      const waiting = entry(await insertClient());
      await repository.join(waiting);
      const pending = offer(waiting.id, await freed());
      await repository.createOffer(pending);

      await expect(
        repository.resolveOffer(
          shop,
          pending.id,
          'accepted',
          pending.expiresAt,
        ),
      ).resolves.toBe(false);
      await expect(
        repository.expireOffers(shop, pending.expiresAt),
      ).resolves.toBe(1);
      await expect(
        repository.findOffer(shop, pending.id),
      ).resolves.toMatchObject({ status: 'expired' });
    });
  });
});

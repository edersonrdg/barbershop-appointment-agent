import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmClientRepository } from '../../src/infrastructure/database/repositories/typeorm-client.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const CREATED_AT = new Date('2026-09-28T12:00:00.000Z');
const PHONE = '+5511987654321';
const TEN = new Date('2026-09-29T13:00:00.000Z');
const ELEVEN = new Date('2026-09-29T14:00:00.000Z');
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

interface PostgresError {
  driverError?: { code?: string };
}

async function violation(query: Promise<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (error) {
    return (error as PostgresError).driverError?.code;
  }
}

interface ConsentRow {
  barbershop_id: string;
  client_id: string;
  enabled: boolean;
  channel: string;
  recorded_at: Date;
}

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

  describe('US-25 return reminder', () => {
    let ana: string;

    beforeEach(async () => {
      ana = await insertClient(barbershopA, 'Ana Lima', PHONE);
    });

    const change = (
      enabled: boolean,
      recordedAt: Date,
      barbershopId = barbershopA,
    ) =>
      repository.changeReturnReminder({
        id: randomUUID(),
        barbershopId,
        clientId: ana,
        enabled,
        channel: 'whatsapp',
        recordedAt,
      });

    const consents = (): Promise<ConsentRow[]> =>
      dataSource.query<ConsentRow[]>(
        `SELECT barbershop_id, client_id, enabled, channel, recorded_at
           FROM return_reminder_consents ORDER BY recorded_at`,
      );

    const enabledOf = async (): Promise<boolean> => {
      const [row] = await dataSource.query<
        { return_reminder_enabled: boolean }[]
      >('SELECT return_reminder_enabled FROM clients WHERE id = $1', [ana]);
      return row.return_reminder_enabled;
    };

    it('US-25 CA-25.5 (C20): records every change with value, channel and instant, keeping the earlier ones', async () => {
      expect(await change(true, TEN)).toBe(true);
      expect(await change(false, ELEVEN)).toBe(true);

      expect(await enabledOf()).toBe(false);
      expect(await consents()).toEqual([
        {
          barbershop_id: barbershopA,
          client_id: ana,
          enabled: true,
          channel: 'whatsapp',
          recorded_at: TEN,
        },
        {
          barbershop_id: barbershopA,
          client_id: ana,
          enabled: false,
          channel: 'whatsapp',
          recorded_at: ELEVEN,
        },
      ]);
    });

    it('US-25 (C21): asking for the value in force records nothing', async () => {
      await change(true, TEN);

      expect(await change(true, ELEVEN)).toBe(false);
      expect(await consents()).toHaveLength(1);
    });

    it('US-25 (C21): two concurrent equal changes record one row', async () => {
      const results = await Promise.all([change(true, TEN), change(true, TEN)]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await consents()).toHaveLength(1);
      expect(await enabledOf()).toBe(true);
    });

    it('US-25 door 1 (C22) (a): the CHECK refuses another channel', async () => {
      expect(
        await violation(
          dataSource.query(
            `INSERT INTO return_reminder_consents (id, barbershop_id, client_id, enabled, channel, recorded_at)
             VALUES ($1, $2, $3, true, 'sms', now())`,
            [randomUUID(), barbershopA, ana],
          ),
        ),
      ).toBe(CHECK_VIOLATION);
    });

    it('US-25 door 1 (C22) (b): the FK refuses a client of another barbershop', async () => {
      expect(
        await violation(
          dataSource.query(
            `INSERT INTO return_reminder_consents (id, barbershop_id, client_id, enabled, channel, recorded_at)
             VALUES ($1, $2, $3, true, 'whatsapp', now())`,
            [randomUUID(), barbershopB, ana],
          ),
        ),
      ).toBe(FOREIGN_KEY_VIOLATION);
    });

    it('US-25 RN-26 (C22) (c): a change through another barbershop changes nothing', async () => {
      expect(await change(true, TEN, barbershopB)).toBe(false);

      expect(await enabledOf()).toBe(false);
      expect(await consents()).toEqual([]);
    });

    it('US-25 door 1 (C22) (d): the question is claimed once, never with the reminder on or a recorded change', async () => {
      expect(
        await repository.claimReturnReminderQuestion(barbershopA, ana, TEN),
      ).toBe(true);
      expect(
        await repository.claimReturnReminderQuestion(barbershopA, ana, ELEVEN),
      ).toBe(false);
      expect(
        (await repository.findById(barbershopA, ana))?.returnReminderAskedAt,
      ).toEqual(TEN);

      const bia = await insertClient(barbershopA, 'Bia', '+5511911110003');
      await dataSource.query(
        'UPDATE clients SET return_reminder_enabled = true WHERE id = $1',
        [bia],
      );
      expect(
        await repository.claimReturnReminderQuestion(barbershopA, bia, TEN),
      ).toBe(false);

      const caio = await insertClient(barbershopA, 'Caio', '+5511911110004');
      await repository.changeReturnReminder({
        id: randomUUID(),
        barbershopId: barbershopA,
        clientId: caio,
        enabled: true,
        channel: 'whatsapp',
        recordedAt: TEN,
      });
      await repository.changeReturnReminder({
        id: randomUUID(),
        barbershopId: barbershopA,
        clientId: caio,
        enabled: false,
        channel: 'whatsapp',
        recordedAt: ELEVEN,
      });
      expect(
        await repository.claimReturnReminderQuestion(barbershopA, caio, ELEVEN),
      ).toBe(false);
    });
  });
});

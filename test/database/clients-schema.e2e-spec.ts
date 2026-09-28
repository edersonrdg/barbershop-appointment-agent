import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const PHONE = '+5511987654321';

describe('Clients schema (e2e)', () => {
  let dataSource: DataSource;
  let barbershopA: string;
  let barbershopB: string;
  let barberA: string;

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
       VALUES ($1, $2, 'Ana', NULL, true, now())`,
      [id, barbershopId],
    );
    return id;
  }

  async function insertClient(
    barbershopId: string,
    phone = PHONE,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, 'João', $3, now())`,
      [id, barbershopId, phone],
    );
    return id;
  }

  async function insertAppointment(clientId: string | null): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, '2026-10-05T13:00:00Z', '2026-10-05T13:30:00Z', 'confirmed', 'manual', now())`,
      [id, barbershopA, barberA, clientId],
    );
    return id;
  }

  async function clientOf(appointmentId: string): Promise<unknown> {
    const [row] = await dataSource.query<{ client_id: string | null }[]>(
      'SELECT client_id FROM appointments WHERE id = $1',
      [appointmentId],
    );
    return row.client_id;
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    barbershopA = await insertBarbershop();
    barbershopB = await insertBarbershop();
    barberA = await insertBarber(barbershopA);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  describe('RN-08: the phone identifies the client within the barbershop', () => {
    it('CA-08.3: rejects a second client with the same phone in the same barbershop', async () => {
      await insertClient(barbershopA);

      await expect(insertClient(barbershopA)).rejects.toMatchObject({
        driverError: {
          code: UNIQUE_VIOLATION,
          constraint: 'clients_barbershop_phone_unique',
        },
      });
    });

    it('CA-08.3: accepts the same phone in another barbershop', async () => {
      await insertClient(barbershopA);

      await expect(insertClient(barbershopB)).resolves.toEqual(
        expect.any(String),
      );
    });
  });

  describe('RN-26: the client of an appointment belongs to its barbershop', () => {
    it('CA-08.3: rejects an appointment whose client belongs to another barbershop', async () => {
      const foreignClient = await insertClient(barbershopB);

      await expect(insertAppointment(foreignClient)).rejects.toMatchObject({
        driverError: {
          code: FOREIGN_KEY_VIOLATION,
          constraint: 'appointments_client_fk',
        },
      });
    });

    it('CA-08.3: accepts an appointment with a client of the same barbershop', async () => {
      const client = await insertClient(barbershopA);

      const appointment = await insertAppointment(client);

      expect(await clientOf(appointment)).toBe(client);
    });

    it('CA-08.3: accepts an appointment without a client', async () => {
      const appointment = await insertAppointment(null);

      expect(await clientOf(appointment)).toBeNull();
    });
  });
});

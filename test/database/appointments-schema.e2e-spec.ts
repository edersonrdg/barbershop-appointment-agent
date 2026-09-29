import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const EXCLUSION_VIOLATION = '23P01';

interface AppointmentRow {
  barbershopId?: string;
  barberId?: string;
  startsAt: string;
  endsAt: string;
  status?: string;
  origin?: string;
}

describe('Appointments schema (e2e)', () => {
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
       VALUES ($1, $2, $3, NULL, true, now())`,
      [id, barbershopId, `Barbeiro ${id}`],
    );
    return id;
  }

  async function insertService(barbershopId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, 4500, 30, true, now())`,
      [id, barbershopId, `Serviço ${id}`],
    );
    return id;
  }

  async function insertAppointment(row: AppointmentRow): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        id,
        row.barbershopId ?? barbershopA,
        row.barberId ?? barberA,
        row.startsAt,
        row.endsAt,
        row.status ?? 'confirmed',
        row.origin ?? 'bot',
      ],
    );
    return id;
  }

  function insertAppointmentService(row: {
    appointmentId: string;
    serviceId: string;
    barbershopId: string;
  }) {
    return dataSource.query(
      `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
       VALUES ($1, 0, $2, $3)`,
      [row.appointmentId, row.serviceId, row.barbershopId],
    );
  }

  function insertBlock(row: {
    barbershopId: string;
    barberId: string;
    startsAt: string;
    endsAt: string;
  }) {
    return dataSource.query(
      `INSERT INTO barber_blocks (id, barbershop_id, barber_id, kind, starts_at, ends_at, created_at)
       VALUES ($1, $2, $3, 'block', $4, $5, now())`,
      [randomUUID(), row.barbershopId, row.barberId, row.startsAt, row.endsAt],
    );
  }

  async function count(table: string): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM ${table}`,
    );
    return Number(row.count);
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

  describe('CA-07.4: exclusion constraint (RN-07)', () => {
    it('rejects a direct INSERT of the same interval for the same barber', async () => {
      await insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });

      const insert = insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: EXCLUSION_VIOLATION,
          constraint: 'appointments_no_overlap',
        },
      });
      expect(await count('appointments')).toBe(1);
    });

    it('rejects an appointment overlapping another of the same barber by 1 minute', async () => {
      await insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });

      const insert = insertAppointment({
        startsAt: '2026-10-05T13:29:00Z',
        endsAt: '2026-10-05T14:00:00Z',
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: EXCLUSION_VIOLATION,
          constraint: 'appointments_no_overlap',
        },
      });
      expect(await count('appointments')).toBe(1);
    });

    it('accepts appointments of the same barber that touch on either side', async () => {
      await insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });

      await insertAppointment({
        startsAt: '2026-10-05T13:30:00Z',
        endsAt: '2026-10-05T14:00:00Z',
      });
      await insertAppointment({
        startsAt: '2026-10-05T12:30:00Z',
        endsAt: '2026-10-05T13:00:00Z',
      });

      expect(await count('appointments')).toBe(3);
    });

    it('accepts overlapping appointments of different barbers', async () => {
      const barberB = await insertBarber(barbershopA);
      await insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });

      await insertAppointment({
        barberId: barberB,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });

      expect(await count('appointments')).toBe(2);
    });
  });

  describe('check constraints', () => {
    it('rejects an appointment that ends when it starts', async () => {
      const insert = insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:00:00Z',
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: CHECK_VIOLATION,
          constraint: 'appointments_ends_after_starts_check',
        },
      });
    });

    it('rejects a status outside the list', async () => {
      const insert = insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
        status: 'cancelled',
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: CHECK_VIOLATION,
          constraint: 'appointments_status_check',
        },
      });
    });

    it('rejects an origin outside the list', async () => {
      const insert = insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
        origin: 'whatsapp',
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: CHECK_VIOLATION,
          constraint: 'appointments_origin_check',
        },
      });
    });

    it('rejects a block that ends when it starts', async () => {
      const insert = insertBlock({
        barbershopId: barbershopA,
        barberId: barberA,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:00:00Z',
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: CHECK_VIOLATION,
          constraint: 'barber_blocks_ends_after_starts_check',
        },
      });
    });
  });

  describe('US-11: attendance statuses', () => {
    it.each(['attended', 'no_show'])(
      'CA-11.1: accepts the %s status (ATD-01)',
      async (status) => {
        const id = await insertAppointment({
          startsAt: '2026-10-05T13:00:00Z',
          endsAt: '2026-10-05T13:30:00Z',
          status,
        });

        const [row] = await dataSource.query<{ status: string }[]>(
          'SELECT status FROM appointments WHERE id = $1',
          [id],
        );
        expect(row.status).toBe(status);
      },
    );

    it.each([
      ['confirmed', 'attended'],
      ['confirmed', 'no_show'],
      ['attended', 'confirmed'],
      ['no_show', 'confirmed'],
    ])(
      'RN-03: a %s appointment keeps holding the slot against an overlapping %s one (ATD-04)',
      async (existing, incoming) => {
        await insertAppointment({
          startsAt: '2026-10-05T13:00:00Z',
          endsAt: '2026-10-05T13:30:00Z',
          status: existing,
        });

        const insert = insertAppointment({
          startsAt: '2026-10-05T13:15:00Z',
          endsAt: '2026-10-05T13:45:00Z',
          status: incoming,
        });

        await expect(insert).rejects.toMatchObject({
          driverError: {
            code: EXCLUSION_VIOLATION,
            constraint: 'appointments_no_overlap',
          },
        });
        expect(await count('appointments')).toBe(1);
      },
    );
  });

  describe('RN-26: composite foreign keys', () => {
    it('rejects an appointment whose barber belongs to another barbershop', async () => {
      const insert = insertAppointment({
        barbershopId: barbershopB,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: FOREIGN_KEY_VIOLATION,
          constraint: 'appointments_barber_fk',
        },
      });
      expect(await count('appointments')).toBe(0);
    });

    it('rejects an appointment service whose service belongs to another barbershop', async () => {
      const appointmentId = await insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });
      const foreignService = await insertService(barbershopB);

      const insert = insertAppointmentService({
        appointmentId,
        serviceId: foreignService,
        barbershopId: barbershopA,
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: FOREIGN_KEY_VIOLATION,
          constraint: 'appointment_services_service_fk',
        },
      });
      expect(await count('appointment_services')).toBe(0);
    });

    it('rejects an appointment service whose appointment belongs to another barbershop', async () => {
      const appointmentId = await insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });
      const serviceB = await insertService(barbershopB);

      const insert = insertAppointmentService({
        appointmentId,
        serviceId: serviceB,
        barbershopId: barbershopB,
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: FOREIGN_KEY_VIOLATION,
          constraint: 'appointment_services_appointment_fk',
        },
      });
      expect(await count('appointment_services')).toBe(0);
    });

    it('accepts an appointment service of the same barbershop', async () => {
      const appointmentId = await insertAppointment({
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });
      const serviceA = await insertService(barbershopA);

      await insertAppointmentService({
        appointmentId,
        serviceId: serviceA,
        barbershopId: barbershopA,
      });

      expect(await count('appointment_services')).toBe(1);
    });

    it('rejects a block whose barber belongs to another barbershop', async () => {
      const insert = insertBlock({
        barbershopId: barbershopB,
        barberId: barberA,
        startsAt: '2026-10-05T13:00:00Z',
        endsAt: '2026-10-05T13:30:00Z',
      });

      await expect(insert).rejects.toMatchObject({
        driverError: {
          code: FOREIGN_KEY_VIOLATION,
          constraint: 'barber_blocks_barber_fk',
        },
      });
      expect(await count('barber_blocks')).toBe(0);
    });
  });
});

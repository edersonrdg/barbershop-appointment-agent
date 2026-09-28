import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  Appointment,
  AppointmentOrigin,
} from '../../src/domain/entities/appointment';
import { AppointmentConflictError } from '../../src/domain/errors/appointment-conflict.error';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmAppointmentRepository } from '../../src/infrastructure/database/repositories/typeorm-appointment.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const RANGE = {
  start: new Date('2026-10-05T12:00:00.000Z'),
  end: new Date('2026-10-05T18:00:00.000Z'),
};

describe('TypeOrmAppointmentRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmAppointmentRepository;
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

  async function insertService(barbershopId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, 4500, 30, true, now())`,
      [id, barbershopId, `Serviço ${id}`],
    );
    return id;
  }

  function book(input: {
    barbershopId: string;
    barberId: string;
    serviceIds: string[];
    startsAt: string;
    durationMinutes?: number;
    origin?: AppointmentOrigin;
  }): Appointment {
    return Appointment.book({
      id: randomUUID(),
      barbershopId: input.barbershopId,
      barberId: input.barberId,
      serviceIds: input.serviceIds,
      startsAt: new Date(input.startsAt),
      durationMinutes: input.durationMinutes ?? 30,
      origin: input.origin ?? 'bot',
      now: NOW,
    });
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
    repository = new TypeOrmAppointmentRepository(dataSource);
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

  describe('create', () => {
    it('CA-07.5: persists the appointment and its services in the requested order', async () => {
      const barberId = await insertBarber(barbershopA);
      const beard = await insertService(barbershopA);
      const haircut = await insertService(barbershopA);
      const appointment = book({
        barbershopId: barbershopA,
        barberId,
        serviceIds: [beard, haircut],
        startsAt: '2026-10-05T13:00:00.000Z',
        durationMinutes: 45,
        origin: 'manual',
      });

      await repository.create(appointment);

      const rows = await dataSource.query<Record<string, unknown>[]>(
        `SELECT id, barbershop_id, barber_id, starts_at, ends_at, status, origin, created_at
         FROM appointments`,
      );
      expect(rows).toEqual([
        {
          id: appointment.id,
          barbershop_id: barbershopA,
          barber_id: barberId,
          starts_at: new Date('2026-10-05T13:00:00.000Z'),
          ends_at: new Date('2026-10-05T13:45:00.000Z'),
          status: 'confirmed',
          origin: 'manual',
          created_at: NOW,
        },
      ]);
      const services = await dataSource.query<Record<string, unknown>[]>(
        `SELECT appointment_id, position, service_id, barbershop_id
         FROM appointment_services ORDER BY position`,
      );
      expect(services).toEqual([
        {
          appointment_id: appointment.id,
          position: 0,
          service_id: beard,
          barbershop_id: barbershopA,
        },
        {
          appointment_id: appointment.id,
          position: 1,
          service_id: haircut,
          barbershop_id: barbershopA,
        },
      ]);
    });

    it('CA-07.4: rejects an overlapping appointment of the same barber with AppointmentConflictError citing RN-07', async () => {
      const barberId = await insertBarber(barbershopA);
      const serviceId = await insertService(barbershopA);
      const first = book({
        barbershopId: barbershopA,
        barberId,
        serviceIds: [serviceId],
        startsAt: '2026-10-05T13:00:00.000Z',
      });
      await repository.create(first);
      const second = book({
        barbershopId: barbershopA,
        barberId,
        serviceIds: [serviceId],
        startsAt: '2026-10-05T13:29:00.000Z',
      });

      const create = repository.create(second);

      await expect(create).rejects.toBeInstanceOf(AppointmentConflictError);
      await expect(create).rejects.toMatchObject({
        rule: 'RN-07',
        message: 'O barbeiro já tem um agendamento nesse horário.',
      });
      expect(await count('appointments')).toBe(1);
      const secondServices = await dataSource.query<unknown[]>(
        'SELECT 1 FROM appointment_services WHERE appointment_id = $1',
        [second.id],
      );
      expect(secondServices).toHaveLength(0);
      expect(await count('appointment_services')).toBe(1);
    });

    it('rolls back the appointment and propagates other database errors untranslated', async () => {
      const barberId = await insertBarber(barbershopA);
      const serviceId = await insertService(barbershopA);
      const foreignService = await insertService(barbershopB);
      const appointment = book({
        barbershopId: barbershopA,
        barberId,
        serviceIds: [serviceId, foreignService],
        startsAt: '2026-10-05T13:00:00.000Z',
      });

      const create = repository.create(appointment);

      await expect(create).rejects.toBeInstanceOf(QueryFailedError);
      await expect(create).rejects.toMatchObject({
        driverError: { constraint: 'appointment_services_service_fk' },
      });
      expect(await count('appointments')).toBe(0);
      expect(await count('appointment_services')).toBe(0);
    });
  });

  describe('listBusyPeriods', () => {
    it('CA-07.1: returns only the confirmed appointments of the requested barbers that overlap the range; touching ones are left out', async () => {
      const ana = await insertBarber(barbershopA);
      const bruno = await insertBarber(barbershopA);
      const caio = await insertBarber(barbershopA);
      const serviceId = await insertService(barbershopA);
      const create = (barberId: string, startsAt: string, minutes: number) =>
        repository.create(
          book({
            barbershopId: barbershopA,
            barberId,
            serviceIds: [serviceId],
            startsAt,
            durationMinutes: minutes,
          }),
        );
      await create(ana, '2026-10-05T11:30:00.000Z', 30);
      await create(ana, '2026-10-05T12:00:00.000Z', 30);
      await create(bruno, '2026-10-05T17:30:00.000Z', 30);
      await create(bruno, '2026-10-05T18:00:00.000Z', 30);
      await create(caio, '2026-10-05T14:00:00.000Z', 30);

      const periods = await repository.listBusyPeriods(
        barbershopA,
        [ana, bruno],
        RANGE,
      );

      expect(periods).toEqual([
        {
          barberId: ana,
          start: new Date('2026-10-05T12:00:00.000Z'),
          end: new Date('2026-10-05T12:30:00.000Z'),
        },
        {
          barberId: bruno,
          start: new Date('2026-10-05T17:30:00.000Z'),
          end: new Date('2026-10-05T18:00:00.000Z'),
        },
      ]);
    });

    it('RN-26: does not return an appointment of another barbershop queried by its barber id with the wrong tenant', async () => {
      const foreignBarber = await insertBarber(barbershopB);
      const foreignService = await insertService(barbershopB);
      await repository.create(
        book({
          barbershopId: barbershopB,
          barberId: foreignBarber,
          serviceIds: [foreignService],
          startsAt: '2026-10-05T14:00:00.000Z',
        }),
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
});

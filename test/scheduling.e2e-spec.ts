import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Appointment } from '../src/domain/entities/appointment';
import { UtcPeriod } from '../src/domain/entities/barbershop';
import { AppointmentConflictError } from '../src/domain/errors/appointment-conflict.error';
import { BookAppointmentUseCase } from '../src/usecases/book-appointment/book-appointment.use-case';
import { ListAvailableSlotsUseCase } from '../src/usecases/list-available-slots/list-available-slots.use-case';
import { APPOINTMENT_METRICS } from '../src/usecases/ports/appointment-metrics.port';
import {
  APPOINTMENT_REPOSITORY,
  AppointmentRepository,
  BusyPeriod,
} from '../src/usecases/ports/appointment.repository.port';
import { BARBER_BLOCK_REPOSITORY } from '../src/usecases/ports/barber-block.repository.port';
import { BARBER_REPOSITORY } from '../src/usecases/ports/barber.repository.port';
import { BARBERSHOP_REPOSITORY } from '../src/usecases/ports/barbershop.repository.port';
import { BOOKING_RULES_REPOSITORY } from '../src/usecases/ports/booking-rules.repository.port';
import { CLOCK } from '../src/usecases/ports/clock.port';
import { ID_GENERATOR } from '../src/usecases/ports/id-generator.port';
import { SERVICE_REPOSITORY } from '../src/usecases/ports/service.repository.port';
import { FixedClock } from '../src/usecases/testing/fixed-clock';
import { truncateAccountTables } from './support/truncate-account-tables';

// Friday 09:00 in São Paulo; the bookings are on Monday 2026-10-05.
const NOW = new Date('2026-10-02T12:00:00.000Z');
const MONDAY = '2026-10-05';
const ISO_MONDAY = 1;

// Holds every listBusyPeriods call until `parties` of them have read, so the
// concurrent bookings all pass the application check and reach the INSERT.
class BarrierAppointmentRepository implements AppointmentRepository {
  private arrived = 0;
  private release!: () => void;
  private readonly allRead = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  constructor(
    private readonly inner: AppointmentRepository,
    private readonly parties: number,
  ) {}

  async listBusyPeriods(
    barbershopId: string,
    barberIds: readonly string[],
    range: UtcPeriod,
  ): Promise<BusyPeriod[]> {
    const periods = await this.inner.listBusyPeriods(
      barbershopId,
      barberIds,
      range,
    );
    this.arrived += 1;
    if (this.arrived === this.parties) this.release();
    await this.allRead;
    return periods;
  }

  create(appointment: Appointment): Promise<void> {
    return this.inner.create(appointment);
  }

  findById(
    barbershopId: string,
    appointmentId: string,
  ): Promise<Appointment | null> {
    return this.inner.findById(barbershopId, appointmentId);
  }

  saveStatus(appointment: Appointment): Promise<void> {
    return this.inner.saveStatus(appointment);
  }
}

describe('Scheduling (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let barbershopId: string;
  let barberId: string;
  let serviceId: string;

  async function seed(): Promise<void> {
    barbershopId = randomUUID();
    barberId = randomUUID();
    serviceId = randomUUID();
    await dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`,
      [barbershopId],
    );
    await dataSource.query(
      `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '09:00', '18:00')`,
      [barbershopId, ISO_MONDAY],
    );
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, 'Corte', 4500, 30, true, now())`,
      [serviceId, barbershopId],
    );
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, 'Ana', NULL, true, now())`,
      [barberId, barbershopId],
    );
    await dataSource.query(
      `INSERT INTO barber_services (barber_id, service_id, barbershop_id, position)
       VALUES ($1, $2, $3, 0)`,
      [barberId, serviceId, barbershopId],
    );
    await dataSource.query(
      `INSERT INTO barber_working_hours (barber_id, weekday, starts_at, ends_at)
       VALUES ($1, $2, '09:00', '12:00')`,
      [barberId, ISO_MONDAY],
    );
  }

  async function count(table: string): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM ${table}`,
    );
    return Number(row.count);
  }

  function bookingWithBarrier(
    appointments: AppointmentRepository,
  ): BookAppointmentUseCase {
    return new BookAppointmentUseCase(
      app.get(BARBERSHOP_REPOSITORY),
      app.get(BOOKING_RULES_REPOSITORY),
      app.get(BARBER_REPOSITORY),
      app.get(SERVICE_REPOSITORY),
      appointments,
      app.get(BARBER_BLOCK_REPOSITORY),
      new FixedClock(NOW),
      app.get(ID_GENERATOR),
      app.get(APPOINTMENT_METRICS),
    );
  }

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(NOW))
      .compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>();
    await app.init();
    dataSource = app.get(DataSource);
    await truncateAccountTables(dataSource);
    await seed();
  });

  afterEach(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  it('CA-07.4: persists exactly one of two simultaneous bookings of the same slot and rejects the other citing RN-07', async () => {
    const barrier = new BarrierAppointmentRepository(
      app.get<AppointmentRepository>(APPOINTMENT_REPOSITORY),
      2,
    );
    const useCase = bookingWithBarrier(barrier);
    const input = {
      barbershopId,
      barberId,
      serviceIds: [serviceId],
      startsAt: new Date('2026-10-05T13:00:00.000Z'),
      origin: 'bot' as const,
    };

    const results = await Promise.allSettled([
      useCase.execute(input),
      useCase.execute(input),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Appointment> =>
        result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(AppointmentConflictError);
    expect(rejected[0].reason).toMatchObject({
      rule: 'RN-07',
      message: 'O barbeiro já tem um agendamento nesse horário.',
    });
    const rows = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM appointments',
    );
    expect(rows).toEqual([{ id: fulfilled[0].value.id }]);
    expect(await count('appointment_services')).toBe(1);
  });

  it('CA-07.1/CA-07.5: a slot returned by the query is booked in the database and the next query no longer returns it', async () => {
    const listSlots = app.get(ListAvailableSlotsUseCase);
    const book = app.get(BookAppointmentUseCase);
    const query = {
      barbershopId,
      barberId,
      serviceIds: [serviceId],
      date: MONDAY,
      origin: 'bot' as const,
    };
    const slotAt = (start: string, end: string) => ({
      barberId,
      startsAt: new Date(start),
      endsAt: new Date(end),
    });

    const before = await listSlots.execute(query);

    expect(before).toEqual([
      slotAt('2026-10-05T12:00:00.000Z', '2026-10-05T12:30:00.000Z'),
      slotAt('2026-10-05T12:30:00.000Z', '2026-10-05T13:00:00.000Z'),
      slotAt('2026-10-05T13:00:00.000Z', '2026-10-05T13:30:00.000Z'),
      slotAt('2026-10-05T13:30:00.000Z', '2026-10-05T14:00:00.000Z'),
      slotAt('2026-10-05T14:00:00.000Z', '2026-10-05T14:30:00.000Z'),
      slotAt('2026-10-05T14:30:00.000Z', '2026-10-05T15:00:00.000Z'),
    ]);
    const chosen = before[2];

    const appointment = await book.execute({
      barbershopId,
      barberId: chosen.barberId,
      serviceIds: [serviceId],
      startsAt: chosen.startsAt,
      origin: 'bot',
    });

    const rows = await dataSource.query<Record<string, unknown>[]>(
      'SELECT id, barber_id, starts_at, ends_at, status, origin FROM appointments',
    );
    expect(rows).toEqual([
      {
        id: appointment.id,
        barber_id: barberId,
        starts_at: chosen.startsAt,
        ends_at: chosen.endsAt,
        status: 'confirmed',
        origin: 'bot',
      },
    ]);
    const after = await listSlots.execute(query);
    expect(after).toEqual([...before.slice(0, 2), ...before.slice(3)]);
  });

  it('AVL-38/AVL-39: GET /metrics exposes the booked and conflict counters by origin', async () => {
    const book = app.get(BookAppointmentUseCase);
    const input = {
      barbershopId,
      barberId,
      serviceIds: [serviceId],
      startsAt: new Date('2026-10-05T13:00:00.000Z'),
      origin: 'manual' as const,
    };
    await book.execute(input);
    await expect(book.execute(input)).rejects.toBeInstanceOf(
      AppointmentConflictError,
    );

    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(response.text).toContain(
      'appointments_booked_total{origin="manual"} 1',
    );
    expect(response.text).toContain(
      'appointment_conflicts_total{origin="manual"} 1',
    );
  });
});

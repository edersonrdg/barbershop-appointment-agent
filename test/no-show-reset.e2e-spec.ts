import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { NoShowResetJob } from '../src/infrastructure/jobs/no-show-reset.job';
import { CLOCK } from '../src/usecases/ports/clock.port';
import { EMAIL_SENDER } from '../src/usecases/ports/email-sender.port';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { FixedClock } from '../src/usecases/testing/fixed-clock';
import { signupOwner } from './support/account-flows';
import { truncateAccountTables } from './support/truncate-account-tables';

const NOW = new Date('2026-12-30T12:00:00.000Z');
const NINETY_DAYS_AGO = '2026-10-01T12:00:00.000Z';
const EIGHTY_NINE_DAYS_AGO = '2026-10-02T12:00:00.000Z';

describe('No-show reset job (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  async function barbershopOf(email: string): Promise<string> {
    const [row] = await dataSource.query<{ barbershop_id: string }[]>(
      'SELECT barbershop_id FROM users WHERE email = $1',
      [email],
    );
    return row.barbershop_id;
  }

  // A client of the barbershop with one no-show that started at `startsAt`.
  async function clientWithNoShow(
    barbershopId: string,
    name: string,
    phone: string,
    startsAt: string,
  ): Promise<string> {
    const barberId = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, null, true, now())`,
      [barberId, barbershopId, `Barbeiro de ${name}`],
    );
    const clientId = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [clientId, barbershopId, name, phone],
    );
    const start = new Date(startsAt);
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'no_show', 'manual', now())`,
      [
        randomUUID(),
        barbershopId,
        barberId,
        clientId,
        start,
        new Date(start.getTime() + 30 * 60 * 1000),
      ],
    );
    return clientId;
  }

  async function resetAtOf(clientId: string): Promise<Date | null> {
    const [row] = await dataSource.query<{ no_show_reset_at: Date | null }[]>(
      'SELECT no_show_reset_at FROM clients WHERE id = $1',
      [clientId],
    );
    return row.no_show_reset_at;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(new FakeEmailSender())
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(NOW))
      .compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  it('RN-13: schedules the reset once a day at 03:00 in America/Sao_Paulo (ATD-26)', () => {
    const job = app.get(SchedulerRegistry).getCronJob('no-show-reset');

    expect(job.cronTime.source).toBe('0 3 * * *');
    expect(job.cronTime.timeZone).toBe('America/Sao_Paulo');
  });

  it('CA-11.3: the run resets in the database the client with a no-show 90 days ago in every barbershop and keeps the one of 89 days (ATD-23, ATD-24, ATD-27)', async () => {
    await signupOwner(app, 'dono@a.com');
    await signupOwner(app, 'dono@b.com', 'Barbearia B');
    const shopA = await barbershopOf('dono@a.com');
    const shopB = await barbershopOf('dono@b.com');
    const expired = await clientWithNoShow(
      shopA,
      'Maria',
      '+5511987654321',
      NINETY_DAYS_AGO,
    );
    const recent = await clientWithNoShow(
      shopA,
      'João',
      '+5511912345678',
      EIGHTY_NINE_DAYS_AGO,
    );
    const otherShop = await clientWithNoShow(
      shopB,
      'Pedro',
      '+5511955554444',
      NINETY_DAYS_AGO,
    );
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await app.get(NoShowResetJob).run();

    expect(await resetAtOf(expired)).toEqual(NOW);
    expect(await resetAtOf(otherShop)).toEqual(NOW);
    expect(await resetAtOf(recent)).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      { clientsReset: 2, failedBarbershops: 0 },
      'No-show reset finished.',
    );
    const logged = JSON.stringify(logSpy.mock.calls);
    for (const personal of [
      'Maria',
      'João',
      'Pedro',
      '987654321',
      '912345678',
    ]) {
      expect(logged).not.toContain(personal);
    }
  });
});

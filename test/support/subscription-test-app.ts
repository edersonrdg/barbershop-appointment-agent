import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/usecases/ports/clock.port';
import { EMAIL_SENDER } from '../../src/usecases/ports/email-sender.port';
import { PAYMENT_GATEWAY } from '../../src/usecases/ports/payment-gateway.port';
import { FakeEmailSender } from '../../src/usecases/testing/fake-email-sender';
import { FakePaymentGateway } from '../../src/usecases/testing/fake-payment-gateway';
import { SettableClock } from '../../src/usecases/testing/settable-clock';
import { stopScheduledJobs } from './stop-scheduled-jobs';

// Friday 2026-10-02, 12:00 in São Paulo.
export const SUBSCRIPTION_NOW = new Date('2026-10-02T15:00:00.000Z');
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionTestApp {
  app: INestApplication<App>;
  dataSource: DataSource;
  gateway: FakePaymentGateway;
  emailSender: FakeEmailSender;
  clock: SettableClock;
  config: ConfigService;
}

// The Asaas adapter is swapped for a fake: no automated test calls the real
// gateway (US-20).
export async function createSubscriptionTestApp(): Promise<SubscriptionTestApp> {
  const gateway = new FakePaymentGateway();
  const emailSender = new FakeEmailSender();
  const clock = new SettableClock(SUBSCRIPTION_NOW);
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PAYMENT_GATEWAY)
    .useValue(gateway)
    .overrideProvider(EMAIL_SENDER)
    .useValue(emailSender)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  await app.init();
  stopScheduledJobs(app);
  return {
    app,
    dataSource: app.get(DataSource),
    gateway,
    emailSender,
    clock,
    config: app.get(ConfigService),
  };
}

export async function barbershopOfOwner(
  dataSource: DataSource,
  email: string,
): Promise<string> {
  const [row] = await dataSource.query<{ barbershop_id: string }[]>(
    'SELECT barbershop_id FROM users WHERE email = $1',
    [email],
  );
  return row.barbershop_id;
}

/** The "ativa" barbershop of the checks: card, `sub_1`, paid until 2026-11-02. */
export async function makeActive(
  dataSource: DataSource,
  barbershopId: string,
  { status = 'active', subscriptionId = 'sub_1' } = {},
): Promise<void> {
  await dataSource.query(
    'UPDATE barbershops SET subscription_status = $2 WHERE id = $1',
    [barbershopId, status],
  );
  await dataSource.query(
    `INSERT INTO barbershop_subscriptions
       (barbershop_id, payment_method, gateway_subscription_id, gateway_checkout_id, paid_until)
     VALUES ($1, 'credit_card', $2, $3, '2026-11-02')`,
    [barbershopId, subscriptionId, `chk_${subscriptionId}`],
  );
}

/** A barbershop in trial that already started a Pix subscription. */
export async function withPixSubscription(
  dataSource: DataSource,
  barbershopId: string,
  subscriptionId = 'sub_1',
): Promise<void> {
  await dataSource.query(
    `INSERT INTO barbershop_subscriptions
       (barbershop_id, payment_method, gateway_customer_id, gateway_subscription_id)
     VALUES ($1, 'pix', 'cus_1', $2)`,
    [barbershopId, subscriptionId],
  );
}

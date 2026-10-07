import { randomUUID } from 'node:crypto';
import { Controller, INestApplication, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { listRoutes } from '../src/infrastructure/http/api-docs/route-catalog';
import { AppointmentRemindersJob } from '../src/infrastructure/jobs/appointment-reminders.job';
import { CLOCK } from '../src/usecases/ports/clock.port';
import { EMAIL_SENDER } from '../src/usecases/ports/email-sender.port';
import {
  MESSAGE_INTERPRETER,
  MessageInterpretation,
} from '../src/usecases/ports/message-interpreter.port';
import { PAYMENT_GATEWAY } from '../src/usecases/ports/payment-gateway.port';
import { WHATSAPP_CONNECTOR } from '../src/usecases/ports/whatsapp-connector.port';
import { privacyNoticeText } from '../src/usecases/receive-whatsapp-message/receive-whatsapp-message.use-case';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { FakeMessageInterpreter } from '../src/usecases/testing/fake-message-interpreter';
import { FakePaymentGateway } from '../src/usecases/testing/fake-payment-gateway';
import { FakeWhatsAppConnector } from '../src/usecases/testing/fake-whatsapp-connector';
import { SettableClock } from '../src/usecases/testing/settable-clock';
import { createBarber, PASSWORD, signupOwner } from './support/account-flows';
import { stopScheduledJobs } from './support/stop-scheduled-jobs';
import {
  barbershopOfOwner,
  DAY_MS,
  SUBSCRIPTION_NOW,
  withPixSubscription,
} from './support/subscription-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const OWNER_EMAIL = 'ana@barbearia.test';
const OTHER_OWNER_EMAIL = 'dono@outra.test';
const BARBER_EMAIL = 'joao@barbearia.test';
const SHOP_NAME = 'Barbearia do Zé';
const SUSPENDED_WRITE =
  'A assinatura desta barbearia está inativa. O painel está em modo leitura até a assinatura ser regularizada.';
const SUSPENDED_REPLY =
  'Olá! No momento o atendimento automático da Barbearia do Zé está indisponível. Para agendar ou tirar dúvidas, fale direto com a barbearia.';
const HAIRCUT = { name: 'Corte', priceCents: 4500, durationMinutes: 30 };
const PHONE = '+5511987654321';
const JID = '5511987654321@s.whatsapp.net';
const NEW_PHONE = '+5511955554444';
const NEW_JID = '5511955554444@s.whatsapp.net';

// Mounted only here, with no decorator at all: it stands for the next write
// route a story adds (door 2).
@Controller('us21-probe')
class ProbeController {
  @Post()
  create(): { ok: true } {
    return { ok: true };
  }
}

function interpretation(
  partial: Partial<MessageInterpretation>,
): MessageInterpretation {
  return {
    topics: [],
    services: [],
    unknownServices: [],
    offTopic: false,
    humanRequested: false,
    bookingRequested: false,
    barber: null,
    anyBarber: false,
    date: null,
    period: null,
    time: null,
    cancelRequested: false,
    rescheduleRequested: false,
    confirmRequested: false,
    choice: null,
    addOnAccepted: false,
    waitlistAccepted: false,
    offerDeclined: false,
    ...partial,
  };
}

describe('US-21 subscription suspension (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let gateway: FakePaymentGateway;
  let emailSender: FakeEmailSender;
  let connector: FakeWhatsAppConnector;
  let interpreter: FakeMessageInterpreter;
  let clock: SettableClock;
  let config: ConfigService;

  let ownerToken: string;
  let barberToken: string;
  let barberUserId: string;
  let otherOwnerToken: string;
  let shop: string;
  let sequence = 0;

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function suspendTrial(): Promise<void> {
    await dataSource.query(
      'UPDATE barbershops SET trial_ends_at = $2 WHERE id = $1',
      [shop, new Date(SUBSCRIPTION_NOW.getTime() - DAY_MS)],
    );
  }

  /** "atrasada": card charge failed `failedDaysAgo` days ago. */
  async function makePastDue(failedDaysAgo = 6): Promise<void> {
    await dataSource.query(
      `UPDATE barbershops SET subscription_status = 'past_due' WHERE id = $1`,
      [shop],
    );
    await dataSource.query(
      `INSERT INTO barbershop_subscriptions
         (barbershop_id, payment_method, gateway_subscription_id, gateway_checkout_id,
          paid_until, payment_failed_at, payment_issue_url)
       VALUES ($1, 'credit_card', 'sub_1', 'chk_1', '2026-10-02', $2,
               'https://sandbox.asaas.com/i/pay_2')`,
      [shop, new Date(SUBSCRIPTION_NOW.getTime() - failedDaysAgo * DAY_MS)],
    );
  }

  /** "encerrada": cancelled card subscription paid until `paidUntil`. */
  async function makeEnded(paidUntil = '2026-10-01'): Promise<void> {
    await dataSource.query(
      `UPDATE barbershops SET subscription_status = 'active' WHERE id = $1`,
      [shop],
    );
    await dataSource.query(
      `INSERT INTO barbershop_subscriptions
         (barbershop_id, payment_method, gateway_subscription_id, gateway_checkout_id,
          paid_until, cancel_requested_at)
       VALUES ($1, 'credit_card', 'sub_1', 'chk_1', $2, '2026-09-10T12:00:00Z')`,
      [shop, paidUntil],
    );
  }

  function postService(token = ownerToken) {
    return request(server())
      .post('/settings/services')
      .set(auth(token))
      .send(HAIRCUT);
  }

  async function serviceCount(): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM services WHERE barbershop_id = $1',
      [shop],
    );
    return Number(row.count);
  }

  function paymentWebhook(
    event: string,
    subscription: string,
    dueDate: string,
  ) {
    sequence += 1;
    return request(server())
      .post('/webhooks/payments/asaas')
      .set(
        'asaas-access-token',
        config.get<string>('ASAAS_WEBHOOK_TOKEN') ?? '',
      )
      .send({
        id: `evt_us21_${sequence}`,
        event,
        dateCreated: '2026-10-02 12:00:00',
        payment: {
          object: 'payment',
          id: `pay_us21_${sequence}`,
          subscription,
          dueDate,
          invoiceUrl: 'https://sandbox.asaas.com/i/pay_1',
          status: 'CONFIRMED',
        },
      })
      .expect(200);
  }

  function getSubscription(token = ownerToken) {
    return request(server()).get('/subscription').set(auth(token));
  }

  async function connectShop(): Promise<void> {
    await dataSource.query(
      `INSERT INTO whatsapp_connections (barbershop_id, status, disconnected_at, updated_at)
       VALUES ($1, 'connected', NULL, $2)`,
      [shop, SUBSCRIPTION_NOW],
    );
  }

  async function insertNotifiedClient(): Promise<string> {
    const [existing] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM clients WHERE barbershop_id = $1 AND phone = $2',
      [shop, PHONE],
    );
    if (existing) return existing.id;
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at, privacy_notice_sent_at)
       VALUES ($1, $2, 'João Silva', $3, now(), $4)`,
      [id, shop, PHONE, SUBSCRIPTION_NOW],
    );
    return id;
  }

  function messageUpsert(remoteJid = JID, text = 'quero marcar um corte') {
    return request(server())
      .post('/webhooks/whatsapp/evolution')
      .set(
        'authorization',
        `Bearer ${config.get<string>('WHATSAPP_WEBHOOK_SECRET') ?? ''}`,
      )
      .send({
        event: 'messages.upsert',
        instance: shop,
        data: {
          key: { remoteJid, fromMe: false, id: randomUUID() },
          pushName: 'Carlos Souza',
          message: { conversation: text },
          messageType: 'conversation',
          messageTimestamp: Math.floor(SUBSCRIPTION_NOW.getTime() / 1000),
        },
        apikey: 'instance-token',
      })
      .expect(204);
  }

  async function metricValue(line: string): Promise<number> {
    const response = await request(server()).get('/metrics').expect(200);
    const found = response.text
      .split('\n')
      .find((item) => item.startsWith(`${line} `));
    return found ? Number(found.split(' ')[1]) : 0;
  }

  /** A confirmed appointment of a client of the shop, starting at `startsAt`. */
  async function insertAppointment(startsAt: Date): Promise<string> {
    const service = randomUUID();
    const barber = randomUUID();
    const client = await insertNotifiedClient();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, 4500, 30, true, now())`,
      [service, shop, `Corte ${service}`],
    );
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, NULL, true, now())`,
      [barber, shop, `João ${barber}`],
    );
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', 'manual', $7)`,
      [
        id,
        shop,
        barber,
        client,
        startsAt,
        new Date(startsAt.getTime() + 30 * 60 * 1000),
        new Date(SUBSCRIPTION_NOW.getTime() - 3 * DAY_MS),
      ],
    );
    await dataSource.query(
      `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
       VALUES ($1, 0, $2, $3)`,
      [id, service, shop],
    );
    return id;
  }

  beforeAll(async () => {
    gateway = new FakePaymentGateway();
    emailSender = new FakeEmailSender();
    connector = new FakeWhatsAppConnector();
    interpreter = new FakeMessageInterpreter();
    clock = new SettableClock(SUBSCRIPTION_NOW);
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(gateway)
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .overrideProvider(CLOCK)
      .useValue(clock)
      .overrideProvider(WHATSAPP_CONNECTOR)
      .useValue(connector)
      .overrideProvider(MESSAGE_INTERPRETER)
      .useValue(interpreter)
      .compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>();
    await app.init();
    stopScheduledJobs(app);
    dataSource = app.get(DataSource);
    config = app.get(ConfigService);
  });

  beforeEach(async () => {
    clock.current = SUBSCRIPTION_NOW;
    await truncateAccountTables(dataSource);
    gateway.owners.clear();
    connector.reset();
    interpreter.reset();
    ({ accessToken: ownerToken } = await signupOwner(
      app,
      OWNER_EMAIL,
      SHOP_NAME,
    ));
    shop = await barbershopOfOwner(dataSource, OWNER_EMAIL);
    barberToken = await createBarber(
      app,
      emailSender,
      config.get<string>('APP_WEB_URL') ?? '',
      ownerToken,
      BARBER_EMAIL,
    );
    const [barber] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM users WHERE email = $1',
      [BARBER_EMAIL],
    );
    barberUserId = barber.id;
    ({ accessToken: otherOwnerToken } = await signupOwner(
      app,
      OTHER_OWNER_EMAIL,
      'Outra Barbearia',
    ));
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('S2 - the suspended bot', () => {
    it('CA-21.1, AC 8, AC 11 (C11): a new phone gets the privacy notice and then the fixed reply, without the interpreter', async () => {
      await suspendTrial();
      await connectShop();

      await messageUpsert(NEW_JID);

      const [row] = await dataSource.query<{ count: string }[]>(
        'SELECT count(*) FROM clients WHERE barbershop_id = $1 AND phone = $2',
        [shop, NEW_PHONE],
      );
      expect(Number(row.count)).toBe(1);
      expect(connector.sentTexts).toEqual([
        {
          barbershopId: shop,
          phone: NEW_PHONE,
          text: privacyNoticeText(
            SHOP_NAME,
            config.get<string>('PRIVACY_POLICY_URL') ?? '',
          ),
        },
        { barbershopId: shop, phone: NEW_PHONE, text: SUSPENDED_REPLY },
      ]);
      expect(interpreter.inputs).toEqual([]);
    });

    it('AC 13 (C12): the fixed reply is counted as kind="suspended"', async () => {
      await suspendTrial();
      await connectShop();
      await insertNotifiedClient();
      const before = await metricValue(
        'whatsapp_replies_total{kind="suspended"}',
      );

      await messageUpsert();

      expect(connector.sentTexts.map(({ text }) => text)).toEqual([
        SUSPENDED_REPLY,
      ]);
      expect(
        await metricValue('whatsapp_replies_total{kind="suspended"}'),
      ).toBe(before + 1);
    });

    it('AC 12 (C14): the reminders job neither claims nor sends the reminders of a suspended barbershop', async () => {
      await suspendTrial();
      await connectShop();
      const in24h = await insertAppointment(
        new Date(SUBSCRIPTION_NOW.getTime() + DAY_MS),
      );
      const in1h = await insertAppointment(
        new Date(SUBSCRIPTION_NOW.getTime() + 60 * 60 * 1000),
      );

      await app.get(AppointmentRemindersJob).run();

      const rows = await dataSource.query<
        {
          reminder_24h_sent_at: Date | null;
          reminder_1h_sent_at: Date | null;
        }[]
      >(
        'SELECT reminder_24h_sent_at, reminder_1h_sent_at FROM appointments WHERE id = ANY($1)',
        [[in24h, in1h]],
      );
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.reminder_24h_sent_at).toBeNull();
        expect(row.reminder_1h_sent_at).toBeNull();
      }
      expect(connector.sentTexts).toEqual([]);
    });
  });

  describe('S3 - the read-only panel', () => {
    it('CA-21.2, AC 14, AC 6 (C15): a write of an expired trial gets 402 and stores nothing; back in trial it goes through', async () => {
      await suspendTrial();

      const refused = await postService().expect(402);

      expect(refused.body).toEqual({ message: SUSPENDED_WRITE });
      expect(await serviceCount()).toBe(0);

      await dataSource.query(
        'UPDATE barbershops SET trial_ends_at = $2 WHERE id = $1',
        [shop, new Date(SUBSCRIPTION_NOW.getTime() + DAY_MS)],
      );
      await postService().expect(201);
      expect(await serviceCount()).toBe(1);
    });

    it('CA-21.2, AC 14 (C16): PUT, PATCH and DELETE of the Owner and POST of the Barber get 402 and change nothing', async () => {
      const appointment = await insertAppointment(
        new Date(SUBSCRIPTION_NOW.getTime() - 2 * 60 * 60 * 1000),
      );
      const [rulesBefore] = await dataSource.query<unknown[]>(
        'SELECT * FROM barbershop_booking_rules WHERE barbershop_id = $1',
        [shop],
      );
      await suspendTrial();

      const calls = [
        () =>
          request(server())
            .put('/settings/rules')
            .set(auth(ownerToken))
            .send({ cancellationDeadlineHours: 5 }),
        () =>
          request(server())
            .patch(`/appointments/${appointment}/status`)
            .set(auth(ownerToken))
            .send({ status: 'attended' }),
        () =>
          request(server())
            .delete(`/users/${barberUserId}`)
            .set(auth(ownerToken)),
        () =>
          request(server()).post('/blocks').set(auth(barberToken)).send({
            startsAt: '2026-10-05T12:00:00Z',
            endsAt: '2026-10-05T13:00:00Z',
          }),
      ];
      for (const call of calls) {
        const response = await call();
        expect(response.status).toBe(402);
        expect(response.body).toEqual({ message: SUSPENDED_WRITE });
      }

      const [rulesAfter] = await dataSource.query<unknown[]>(
        'SELECT * FROM barbershop_booking_rules WHERE barbershop_id = $1',
        [shop],
      );
      expect(rulesAfter).toEqual(rulesBefore);
      const [status] = await dataSource.query<{ status: string }[]>(
        'SELECT status FROM appointments WHERE id = $1',
        [appointment],
      );
      expect(status.status).toBe('confirmed');
      const users = await dataSource.query<unknown[]>(
        'SELECT id FROM users WHERE id = $1',
        [barberUserId],
      );
      expect(users).toHaveLength(1);
      const blocks = await dataSource.query<unknown[]>(
        'SELECT id FROM barber_blocks WHERE barbershop_id = $1',
        [shop],
      );
      expect(blocks).toEqual([]);
    });

    it('CA-21.2, AC 15 (C17): reads still answer 200', async () => {
      await suspendTrial();

      for (const path of [
        '/settings/services',
        '/appointments?view=day&date=2026-10-02',
        '/clients',
        '/subscription',
      ]) {
        const response = await request(server())
          .get(path)
          .set(auth(ownerToken));
        expect({ path, status: response.status }).toEqual({
          path,
          status: 200,
        });
      }
    });

    it('AC 16 (C18): no public write answers 402, and the Owner still logs in', async () => {
      await suspendTrial();
      const publicWrites = listRoutes(app).filter(
        (route) => route.isPublic && route.method !== 'get',
      );

      expect(publicWrites.length).toBeGreaterThan(0);
      for (const route of publicWrites) {
        const path = route.path.replace(/\{[^}]+\}/g, randomUUID());
        const response = await request(server())
          [route.method as 'post'](path)
          .set(auth(ownerToken))
          .send({});
        expect({ route: route.path, status: response.status }).not.toEqual({
          route: route.path,
          status: 402,
        });
      }
      const login = await request(server())
        .post('/auth/login')
        .send({ email: OWNER_EMAIL, password: PASSWORD })
        .expect(200);
      expect(login.body).toHaveProperty('accessToken');
    });

    it('AC 14 (C19): checkout and cancel stay open to an expired trial', async () => {
      await suspendTrial();

      const checkout = await request(server())
        .post('/subscription/checkout')
        .set(auth(ownerToken))
        .send({ method: 'credit_card' })
        .expect(201);
      expect(checkout.body).toHaveProperty('paymentUrl');

      const cancel = await request(server())
        .post('/subscription/cancel')
        .set(auth(ownerToken))
        .expect(409);
      expect(cancel.body).toEqual({
        message: 'Não há assinatura ativa para cancelar.',
      });
    });

    it('CA-21.2, AC 17 (C20): GET /me gives the reason to the Owner and the Barber, and null in good standing', async () => {
      await suspendTrial();

      for (const token of [ownerToken, barberToken]) {
        const me = await request(server())
          .get('/me')
          .set(auth(token))
          .expect(200);
        expect(
          (me.body as { barbershop: { suspensionReason: unknown } }).barbershop
            .suspensionReason,
        ).toBe('trial_ended');
      }
      const other = await request(server())
        .get('/me')
        .set(auth(otherOwnerToken))
        .expect(200);
      expect(
        (other.body as { barbershop: { suspensionReason: unknown } }).barbershop
          .suspensionReason,
      ).toBeNull();
      await request(server()).get('/me').expect(401);
    });

    it('CA-21.3, AC 18 (C21): GET /subscription is payment_overdue 6 days after the failure and null after 4', async () => {
      await makePastDue(6);

      const overdue = await getSubscription().expect(200);
      expect(overdue.body).toMatchObject({
        suspensionReason: 'payment_overdue',
      });

      await dataSource.query(
        'UPDATE barbershop_subscriptions SET payment_failed_at = $2 WHERE barbershop_id = $1',
        [shop, new Date(SUBSCRIPTION_NOW.getTime() - 4 * DAY_MS)],
      );
      const inGrace = await getSubscription().expect(200);
      expect(inGrace.body).toMatchObject({ suspensionReason: null });

      const barber = await getSubscription(barberToken).expect(403);
      expect(barber.body).toEqual({ message: 'Acesso negado.' });
      await request(server()).get('/subscription').expect(401);
    });

    it('AC 4, AC 5, AC 14 (C22): a cancelled subscription is suspended the local day after cancelsAt', async () => {
      await makeEnded('2026-10-01');

      const ended = await getSubscription().expect(200);
      expect(ended.body).toMatchObject({
        suspensionReason: 'subscription_ended',
      });
      await postService().expect(402);

      await dataSource.query(
        `UPDATE barbershop_subscriptions SET paid_until = '2026-10-02' WHERE barbershop_id = $1`,
        [shop],
      );
      const lastDay = await getSubscription().expect(200);
      expect(lastDay.body).toMatchObject({ suspensionReason: null });
      await postService().expect(201);
    });

    it('AC 20 (C25): a refused write is counted with its reason', async () => {
      await suspendTrial();
      const metric = 'subscription_blocked_writes_total{reason="trial_ended"}';
      const before = await metricValue(metric);

      await postService().expect(402);

      expect(await metricValue(metric)).toBe(before + 1);
    });

    it('door 2 (C26): a new write route with no decorator is refused while suspended', async () => {
      const probe = () =>
        request(server()).post('/us21-probe').set(auth(ownerToken));

      await probe().expect(201);
      await suspendTrial();
      const refused = await probe().expect(402);
      expect(refused.body).toEqual({ message: SUSPENDED_WRITE });
    });
  });

  describe('S4 - regularizing reactivates at once', () => {
    it('CA-21.4, AC 21 (C28): a past-due barbershop writes again right after the payment is received', async () => {
      await makePastDue(6);
      await postService().expect(402);

      await paymentWebhook('PAYMENT_RECEIVED', 'sub_1', '2026-10-02');

      await postService().expect(201);
      const me = await request(server())
        .get('/me')
        .set(auth(ownerToken))
        .expect(200);
      expect(
        (me.body as { barbershop: { suspensionReason: unknown } }).barbershop
          .suspensionReason,
      ).toBeNull();
    });

    it('CA-21.4, AC 21 (C29): after the payment of an expired trial the bot answers through the interpreter again', async () => {
      await suspendTrial();
      await withPixSubscription(dataSource, shop, 'sub_1');
      await connectShop();
      await insertNotifiedClient();

      await paymentWebhook('PAYMENT_CONFIRMED', 'sub_1', '2026-10-02');
      interpreter.next = interpretation({ offTopic: true });
      await messageUpsert(JID, 'qual a capital da França?');

      expect(interpreter.inputs).toHaveLength(1);
      expect(connector.sentTexts).toHaveLength(1);
      expect(connector.sentTexts[0].text).not.toBe(SUSPENDED_REPLY);
    });

    it('CA-21.4, AC 22 (C31): an ended subscription can check out again', async () => {
      await makeEnded('2026-10-01');

      const response = await request(server())
        .post('/subscription/checkout')
        .set(auth(ownerToken))
        .send({ method: 'credit_card' })
        .expect(201);

      expect(response.body).toHaveProperty('paymentUrl');
    });

    it('CA-21.4, AC 23 (C33): the first payment of the new subscription leaves it active without cancellation', async () => {
      await makeEnded('2026-10-01');
      await request(server())
        .post('/subscription/checkout')
        .set(auth(ownerToken))
        .send({ method: 'credit_card' })
        .expect(201);
      const [row] = await dataSource.query<{ gateway_checkout_id: string }[]>(
        'SELECT gateway_checkout_id FROM barbershop_subscriptions WHERE barbershop_id = $1',
        [shop],
      );
      gateway.owners.set('sub_2', {
        barbershopId: null,
        checkoutId: row.gateway_checkout_id,
      });

      await paymentWebhook('PAYMENT_CONFIRMED', 'sub_2', '2026-10-02');

      const after = await getSubscription().expect(200);
      expect(after.body).toMatchObject({
        status: 'active',
        cancelsAt: null,
        nextChargeDate: '2026-11-02',
        suspensionReason: null,
      });
    });
  });
});

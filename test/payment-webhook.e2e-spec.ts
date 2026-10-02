import { Logger } from '@nestjs/common';
import request from 'supertest';
import { signupOwner } from './support/account-flows';
import {
  barbershopOfOwner,
  createSubscriptionTestApp,
  makeActive,
  SubscriptionTestApp,
  withPixSubscription,
} from './support/subscription-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const OWNER_EMAIL = 'ana@barbearia.test';
const INVOICE_URL = 'https://sandbox.asaas.com/i/pay_1';
const FAILURE_SUBJECT = 'Não conseguimos cobrar sua assinatura';

describe('US-20 Asaas payment webhook (e2e)', () => {
  let t: SubscriptionTestApp;
  let ownerToken: string;
  let shop: string;
  let token: string;
  let sequence = 0;

  const server = () => t.app.getHttpServer();

  function post(body: unknown, header: string | null = token) {
    const call = request(server()).post('/webhooks/payments/asaas');
    if (header !== null) call.set('asaas-access-token', header);
    return call.send(body as object);
  }

  function paymentEvent(
    event: string,
    dueDate: string,
    { id, subscription = 'sub_1' }: { id?: string; subscription?: string } = {},
  ) {
    sequence += 1;
    return {
      id: id ?? `evt_${sequence}`,
      event,
      dateCreated: '2026-10-02 12:00:00',
      payment: {
        object: 'payment',
        id: `pay_${sequence}`,
        subscription,
        dueDate,
        invoiceUrl: INVOICE_URL,
        status: 'PENDING',
      },
    };
  }

  function show() {
    return request(server())
      .get('/subscription')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
  }

  async function status(): Promise<string> {
    const [row] = await t.dataSource.query<{ subscription_status: string }[]>(
      'SELECT subscription_status FROM barbershops WHERE id = $1',
      [shop],
    );
    return row.subscription_status;
  }

  async function eventRows(eventId: string): Promise<number> {
    const [row] = await t.dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM payment_gateway_events WHERE event_id = $1',
      [eventId],
    );
    return Number(row.count);
  }

  const failureEmails = () =>
    t.emailSender.sent.filter((message) => message.subject === FAILURE_SUBJECT);

  async function rejectSubscriptionWrites(): Promise<void> {
    await t.dataSource.query(`
      CREATE OR REPLACE FUNCTION us20_reject_write() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'write rejected by test'; END;
      $$ LANGUAGE plpgsql`);
    await t.dataSource.query(`
      CREATE TRIGGER us20_reject_write BEFORE INSERT OR UPDATE ON barbershop_subscriptions
      FOR EACH ROW EXECUTE FUNCTION us20_reject_write()`);
  }

  async function allowSubscriptionWrites(): Promise<void> {
    await t.dataSource.query(
      'DROP TRIGGER IF EXISTS us20_reject_write ON barbershop_subscriptions',
    );
    await t.dataSource.query('DROP FUNCTION IF EXISTS us20_reject_write()');
  }

  beforeAll(async () => {
    t = await createSubscriptionTestApp();
    token = t.config.get<string>('ASAAS_WEBHOOK_TOKEN') ?? '';
  });

  beforeEach(async () => {
    await allowSubscriptionWrites();
    await truncateAccountTables(t.dataSource);
    t.gateway.owners.clear();
    t.emailSender.sent.length = 0;
    t.emailSender.failure = null;
    ({ accessToken: ownerToken } = await signupOwner(t.app, OWNER_EMAIL));
    shop = await barbershopOfOwner(t.dataSource, OWNER_EMAIL);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await allowSubscriptionWrites();
    await truncateAccountTables(t.dataSource);
    await t.app.close();
  });

  it('CA-20.1: a confirmed payment makes the barbershop active with the next charge one month later (C15)', async () => {
    await withPixSubscription(t.dataSource, shop);

    await post(paymentEvent('PAYMENT_CONFIRMED', '2026-10-02')).expect(200);

    expect((await show()).body).toMatchObject({
      status: 'active',
      paymentMethod: 'pix',
      paidUntil: '2026-11-02',
      nextChargeDate: '2026-11-02',
    });
  });

  it('AC 11, AC 12: a missing or wrong token is 401; a body without id and an unknown subscription change nothing (C16)', async () => {
    await withPixSubscription(t.dataSource, shop);
    const confirmed = paymentEvent('PAYMENT_CONFIRMED', '2026-10-02');

    await post(confirmed, null).expect(401);
    await post(confirmed, 'x'.repeat(40)).expect(401);
    expect(await status()).toBe('trialing');

    await post({ ...confirmed, id: undefined }).expect(200);
    await post({ ...confirmed, event: undefined }).expect(200);
    await post(
      paymentEvent('PAYMENT_CONFIRMED', '2026-10-02', {
        subscription: 'sub_unknown',
      }),
    ).expect(200);

    expect(await status()).toBe('trialing');
    expect(t.gateway.lookups).toContain('sub_unknown');
  });

  it('AC 13: the same event delivered twice applies once and sends one e-mail (C17)', async () => {
    await makeActive(t.dataSource, shop);
    const refused = paymentEvent(
      'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
      '2026-11-02',
    );

    await post(refused).expect(200);
    await post(refused).expect(200);

    expect(await eventRows(refused.id)).toBe(1);
    expect(failureEmails()).toHaveLength(1);
  });

  it('AC 14: a failure while applying answers 500 and leaves the event for the redelivery (C18)', async () => {
    await withPixSubscription(t.dataSource, shop);
    const confirmed = paymentEvent('PAYMENT_CONFIRMED', '2026-10-02');
    await rejectSubscriptionWrites();

    await post(confirmed).expect(500);
    expect(await eventRows(confirmed.id)).toBe(0);
    expect(await status()).toBe('trialing');

    await allowSubscriptionWrites();
    await post(confirmed).expect(200);
    expect(await eventRows(confirmed.id)).toBe(1);
    expect(await status()).toBe('active');
  });

  it('AC 27: when the failure e-mail cannot go, the webhook answers 200 and logs the barbershop (C34)', async () => {
    await makeActive(t.dataSource, shop);
    t.emailSender.failure = new Error('smtp down');
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await post(
      paymentEvent('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', '2026-11-02'),
    ).expect(200);

    expect(await status()).toBe('past_due');
    expect(errorSpy).toHaveBeenCalledWith(
      { barbershopId: shop, err: { name: 'Error', code: undefined } },
      'Payment failure e-mail could not be sent.',
    );
  });

  it('CA-20.3: a refused charge makes the barbershop past due and e-mails the link (C35)', async () => {
    await makeActive(t.dataSource, shop);

    await post(
      paymentEvent('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', '2026-11-02'),
    ).expect(200);

    expect((await show()).body).toMatchObject({
      status: 'past_due',
      paymentIssueUrl: INVOICE_URL,
    });
    const emails = failureEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(OWNER_EMAIL);
    expect(emails[0].text).toContain(INVOICE_URL);
  });

  it('AC 32: payment_webhook_events_total counts every outcome by event group, with no tenant label (C42)', async () => {
    await withPixSubscription(t.dataSource, shop);
    const confirmed = paymentEvent('PAYMENT_CONFIRMED', '2026-10-02');
    await post(confirmed).expect(200);
    await post(confirmed).expect(200);
    await post(paymentEvent('PAYMENT_CREATED', '2026-10-02')).expect(200);
    await rejectSubscriptionWrites();
    await post(paymentEvent('PAYMENT_RECEIVED', '2026-11-02')).expect(500);
    await allowSubscriptionWrites();

    const metrics = (await request(server()).get('/metrics').expect(200)).text;
    const lines = metrics
      .split('\n')
      .filter((line) => line.startsWith('payment_webhook_events_total{'));
    const value = (labels: string): number => {
      const line = lines.find((item) => item.includes(labels));
      return line ? Number(line.split(' ').pop()) : 0;
    };

    expect(
      value('event_group="payment_confirmed",outcome="applied"'),
    ).toBeGreaterThanOrEqual(1);
    expect(
      value('event_group="payment_confirmed",outcome="duplicate"'),
    ).toBeGreaterThanOrEqual(1);
    expect(
      value('event_group="other",outcome="ignored"'),
    ).toBeGreaterThanOrEqual(1);
    expect(
      value('event_group="payment_confirmed",outcome="failed"'),
    ).toBeGreaterThanOrEqual(1);
    for (const line of lines) {
      expect(line).toMatch(
        /^payment_webhook_events_total\{event_group="(payment_confirmed|payment_failed|other)",outcome="(applied|duplicate|ignored|failed)"\} \d+$/,
      );
    }
  });
});

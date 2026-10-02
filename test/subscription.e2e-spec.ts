import request from 'supertest';
import { createBarber, signupOwner } from './support/account-flows';
import {
  barbershopOfOwner,
  createSubscriptionTestApp,
  DAY_MS,
  makeActive,
  SUBSCRIPTION_NOW,
  SubscriptionTestApp,
} from './support/subscription-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const OWNER_EMAIL = 'ana@barbearia.test';
const ALREADY_SUBSCRIBED = { message: 'Esta barbearia já tem uma assinatura.' };
const GATEWAY_DOWN = {
  message:
    'Não foi possível falar com o serviço de pagamento. Tente novamente.',
};
const NOTHING_TO_CANCEL = { message: 'Não há assinatura ativa para cancelar.' };
const ACCESS_DENIED = { message: 'Acesso negado.' };

describe('US-20 subscription (e2e)', () => {
  let t: SubscriptionTestApp;
  let ownerToken: string;
  let shop: string;

  const server = () => t.app.getHttpServer();

  function show(token = ownerToken) {
    return request(server())
      .get('/subscription')
      .set('Authorization', `Bearer ${token}`);
  }

  function checkout(body: Record<string, unknown>, token = ownerToken) {
    return request(server())
      .post('/subscription/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function cancel(token = ownerToken) {
    return request(server())
      .post('/subscription/cancel')
      .set('Authorization', `Bearer ${token}`);
  }

  async function newOwner(email: string): Promise<[string, string]> {
    const { accessToken } = await signupOwner(t.app, email);
    return [accessToken, await barbershopOfOwner(t.dataSource, email)];
  }

  beforeAll(async () => {
    t = await createSubscriptionTestApp();
  });

  beforeEach(async () => {
    await truncateAccountTables(t.dataSource);
    t.gateway.failing.clear();
    t.gateway.pixHold = null;
    t.gateway.cardCheckouts.length = 0;
    t.gateway.pixSubscriptions.length = 0;
    t.gateway.cancelled.length = 0;
    t.gateway.lookups.length = 0;
    t.gateway.livePixSubscriptions.length = 0;
    t.clock.current = SUBSCRIPTION_NOW;
    [ownerToken, shop] = await newOwner(OWNER_EMAIL);
  });

  afterAll(async () => {
    await truncateAccountTables(t.dataSource);
    await t.app.close();
  });

  it('CA-20.1: the checkout answers 201 with the payment page, and rejects a bad method or document with 400 (C9)', async () => {
    const card = await checkout({ method: 'credit_card' }).expect(201);
    expect(card.body).toEqual({
      paymentUrl: expect.stringMatching(
        /^https:\/\/sandbox\.asaas\.com\/checkoutSession\/show\?id=chk_\d+$/,
      ) as string,
    });

    const pix = await checkout({
      method: 'pix',
      cpfCnpj: '529.982.247-25',
    }).expect(201);
    expect(pix.body).toEqual({
      paymentUrl: expect.stringMatching(
        /^https:\/\/sandbox\.asaas\.com\/i\/pay_\d+$/,
      ) as string,
    });
    expect(t.gateway.pixSubscriptions[0].payer.cpfCnpj).toBe('52998224725');

    const missing = await checkout({ method: 'pix' }).expect(400);
    expect((missing.body as { errors: unknown[] }).errors).toContainEqual({
      field: 'cpfCnpj',
      message: 'Informe o CPF ou CNPJ para pagar com Pix.',
    });

    const invalid = await checkout({
      method: 'pix',
      cpfCnpj: '52998224724',
    }).expect(400);
    expect((invalid.body as { errors: unknown[] }).errors).toContainEqual({
      field: 'cpfCnpj',
      message: 'Informe um CPF ou CNPJ válido.',
    });

    await checkout({ method: 'boleto' }).expect(400);
  });

  it('AC 7, AC 8: an active barbershop gets 409 and a gateway failure 502, staying in trial (C10)', async () => {
    const [otherToken, otherShop] = await newOwner('bia@barbearia.test');
    await makeActive(t.dataSource, otherShop);
    expect(
      (await checkout({ method: 'credit_card' }, otherToken).expect(409)).body,
    ).toEqual(ALREADY_SUBSCRIBED);

    t.gateway.failing.add('createCardCheckout');
    expect(
      (await checkout({ method: 'credit_card' }).expect(502)).body,
    ).toEqual(GATEWAY_DOWN);
    expect((await show().expect(200)).body).toMatchObject({
      status: 'trialing',
      paymentMethod: null,
    });
  });

  it('AC 4: two simultaneous Pix checkouts leave one live gateway subscription, the stored one (C11)', async () => {
    let release = () => {};
    t.gateway.pixHold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const body = { method: 'pix', cpfCnpj: '529.982.247-25' };

    const first = checkout(body).then((response) => response);
    const second = checkout(body).then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    const responses = await Promise.all([first, second]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 201,
    ]);
    expect(t.gateway.livePixSubscriptions).toHaveLength(1);
    const [row] = await t.dataSource.query<
      { gateway_subscription_id: string }[]
    >(
      'SELECT gateway_subscription_id FROM barbershop_subscriptions WHERE barbershop_id = $1',
      [shop],
    );
    expect(row.gateway_subscription_id).toBe(t.gateway.livePixSubscriptions[0]);
  });

  it('AC 15: a new barbershop reads its trial and nothing else (C19)', async () => {
    const response = await show().expect(200);

    expect(response.body).toEqual({
      status: 'trialing',
      trialEndsAt: new Date(
        SUBSCRIPTION_NOW.getTime() + 14 * DAY_MS,
      ).toISOString(),
      trialEndingSoon: false,
      priceCents: 9900,
      paymentMethod: null,
      paidUntil: null,
      nextChargeDate: null,
      cancelsAt: null,
      paymentIssueUrl: null,
    });
  });

  it('AC 16: an active barbershop reads the paid date as the next charge (C20)', async () => {
    await makeActive(t.dataSource, shop);

    expect((await show().expect(200)).body).toMatchObject({
      status: 'active',
      paymentMethod: 'credit_card',
      paidUntil: '2026-11-02',
      nextChargeDate: '2026-11-02',
      cancelsAt: null,
    });
  });

  it('AC 17, CA-02.2: a barber gets 403 and no session gets 401 on every subscription route (C21)', async () => {
    const barberToken = await createBarber(
      t.app,
      t.emailSender,
      t.config.get<string>('APP_WEB_URL') ?? '',
      ownerToken,
      'joao@barbearia.test',
    );
    const routes = [
      () => request(server()).get('/subscription'),
      () =>
        request(server())
          .post('/subscription/checkout')
          .send({ method: 'credit_card' }),
      () => request(server()).post('/subscription/cancel'),
    ];

    for (const route of routes) {
      const denied = await route()
        .set('Authorization', `Bearer ${barberToken}`)
        .expect(403);
      expect(denied.body).toEqual(ACCESS_DENIED);
      await route().expect(401);
    }
    expect(t.gateway.calls).toBe(0);
  });

  it('door 3: GET /me shows active and past_due (C22)', async () => {
    const me = () =>
      request(server())
        .get('/me')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
    await makeActive(t.dataSource, shop);
    expect(
      ((await me()).body as { barbershop: { subscriptionStatus: string } })
        .barbershop.subscriptionStatus,
    ).toBe('active');

    await t.dataSource.query(
      `UPDATE barbershops SET subscription_status = 'past_due' WHERE id = $1`,
      [shop],
    );
    expect(
      ((await me()).body as { barbershop: { subscriptionStatus: string } })
        .barbershop.subscriptionStatus,
    ).toBe('past_due');
  });

  it('AC 22: trialEndingSoon is on only in trial within 3 days, whatever the e-mail did (C29)', async () => {
    const setTrialEnd = (barbershopId: string, at: Date) =>
      t.dataSource.query(
        'UPDATE barbershops SET trial_ends_at = $2 WHERE id = $1',
        [barbershopId, at],
      );
    await setTrialEnd(shop, new Date('2026-10-04T15:00:00.000Z'));
    expect((await show().expect(200)).body).toMatchObject({
      trialEndingSoon: true,
    });

    await setTrialEnd(shop, new Date('2026-10-06T15:00:00.000Z'));
    expect((await show().expect(200)).body).toMatchObject({
      trialEndingSoon: false,
    });

    const [otherToken, otherShop] = await newOwner('bia@barbearia.test');
    await setTrialEnd(otherShop, new Date('2026-10-04T15:00:00.000Z'));
    await makeActive(t.dataSource, otherShop);
    expect((await show(otherToken).expect(200)).body).toMatchObject({
      trialEndingSoon: false,
    });
  });

  it('CA-20.4: cancelling keeps the paid month, a second cancel is 409, a gateway failure is 502 (C38)', async () => {
    await makeActive(t.dataSource, shop);

    expect((await cancel().expect(200)).body).toEqual({
      cancelsAt: '2026-11-02',
    });
    expect((await show().expect(200)).body).toMatchObject({
      status: 'active',
      cancelsAt: '2026-11-02',
      nextChargeDate: null,
    });
    expect((await cancel().expect(409)).body).toEqual(NOTHING_TO_CANCEL);

    const [otherToken, otherShop] = await newOwner('bia@barbearia.test');
    await makeActive(t.dataSource, otherShop, { subscriptionId: 'sub_2' });
    t.gateway.failing.add('cancelSubscription');
    expect((await cancel(otherToken).expect(502)).body).toEqual(GATEWAY_DOWN);
    expect((await show(otherToken).expect(200)).body).toMatchObject({
      cancelsAt: null,
    });
  });
});

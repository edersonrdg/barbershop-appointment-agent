import { Logger } from '@nestjs/common';
import { PaymentGatewayUnavailableError } from '../../../../domain/errors/payment-gateway-unavailable.error';
import { AsaasConfig, AsaasPaymentGateway } from './asaas-payment-gateway';

const SHOP = '0b9f7d8e-8a55-4c1c-9d51-6f2f3d1f0a11';
const CONFIG: AsaasConfig = {
  baseUrl: 'http://asaas.test/v3',
  apiKey: 'asaas-secret-key',
  timeoutMs: 50,
};
const CPF = '52998224725';

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status: number; body?: unknown } | 'network' | 'hang';

function setup(replies: Record<string, Reply>) {
  const requests: Recorded[] = [];
  const fetchFn = ((input: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    const path = input.replace(CONFIG.baseUrl, '');
    requests.push({
      method,
      url: input,
      headers: init.headers as Record<string, string>,
      body: init.body ? (JSON.parse(init.body as string) as unknown) : null,
    });
    const reply = replies[`${method} ${path}`];
    if (!reply) throw new Error(`unexpected ${method} ${path}`);
    if (reply === 'network') {
      return Promise.reject(new TypeError('fetch failed'));
    }
    if (reply === 'hang') {
      return new Promise((_, reject) =>
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('timeout', 'TimeoutError')),
        ),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(reply.body ?? {}), { status: reply.status }),
    );
  }) as unknown as typeof fetch;
  return { gateway: new AsaasPaymentGateway(CONFIG, fetchFn), requests };
}

const CHECKOUT_OK: Record<string, Reply> = {
  'POST /checkouts': {
    status: 200,
    body: {
      id: 'chk_1',
      link: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_1',
    },
  },
};
const PIX_OK: Record<string, Reply> = {
  'POST /customers': { status: 200, body: { id: 'cus_1' } },
  'POST /subscriptions': { status: 200, body: { id: 'sub_1' } },
  'GET /subscriptions/sub_1/payments': {
    status: 200,
    body: {
      object: 'list',
      data: [
        {
          id: 'pay_1',
          dueDate: '2026-10-02',
          invoiceUrl: 'https://sandbox.asaas.com/i/pay_1',
        },
      ],
    },
  },
  'DELETE /subscriptions/sub_1': { status: 200, body: { deleted: true } },
};

const cardRequest = {
  barbershopId: SHOP,
  priceCents: 9900,
  firstDueDate: '2026-10-02',
  returnUrl: 'http://painel.test/assinatura',
};
const pixRequest = {
  barbershopId: SHOP,
  priceCents: 9900,
  firstDueDate: '2026-10-02',
  payer: { name: 'Ana Souza', email: 'ana@barbearia.test', cpfCnpj: CPF },
};

describe('US-20 AsaasPaymentGateway', () => {
  afterEach(() => jest.restoreAllMocks());

  it('AC 1: the card checkout is a monthly recurring card checkout tied to the barbershop (C39)', async () => {
    const { gateway, requests } = setup(CHECKOUT_OK);

    const checkout = await gateway.createCardCheckout(cardRequest);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('http://asaas.test/v3/checkouts');
    expect(requests[0].headers.access_token).toBe('asaas-secret-key');
    expect(requests[0].body).toMatchObject({
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: 60,
      callback: {
        successUrl: 'http://painel.test/assinatura',
        cancelUrl: 'http://painel.test/assinatura',
      },
      items: [{ quantity: 1, value: 99 }],
      subscription: { cycle: 'MONTHLY', nextDueDate: '2026-10-02' },
      externalReference: SHOP,
    });
    expect(checkout).toEqual({
      checkoutId: 'chk_1',
      paymentUrl: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_1',
    });
  });

  it('AC 2: the Pix subscription creates the customer, a monthly Pix subscription and returns the first invoice (C39)', async () => {
    const { gateway, requests } = setup(PIX_OK);

    const pix = await gateway.createPixSubscription(pixRequest);

    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'POST http://asaas.test/v3/customers',
      'POST http://asaas.test/v3/subscriptions',
      'GET http://asaas.test/v3/subscriptions/sub_1/payments',
    ]);
    expect(requests[0].body).toEqual({
      name: 'Ana Souza',
      cpfCnpj: CPF,
      email: 'ana@barbearia.test',
      externalReference: SHOP,
    });
    expect(requests[1].body).toMatchObject({
      customer: 'cus_1',
      billingType: 'PIX',
      cycle: 'MONTHLY',
      value: 99,
      nextDueDate: '2026-10-02',
      externalReference: SHOP,
    });
    for (const request of requests) {
      expect(request.headers.access_token).toBe('asaas-secret-key');
    }
    expect(pix).toEqual({
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      paymentUrl: 'https://sandbox.asaas.com/i/pay_1',
    });
  });

  it('AC 28: cancelling deletes the subscription, and one the gateway no longer has counts as cancelled (C39)', async () => {
    const { gateway, requests } = setup({
      'DELETE /subscriptions/sub_1': { status: 200, body: { deleted: true } },
      'DELETE /subscriptions/sub_0': { status: 404, body: {} },
    });

    await gateway.cancelSubscription('sub_1');
    await gateway.cancelSubscription('sub_0');

    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'DELETE http://asaas.test/v3/subscriptions/sub_1',
      'DELETE http://asaas.test/v3/subscriptions/sub_0',
    ]);
  });

  describe('AC 8, AC 31: every failure becomes PaymentGatewayUnavailableError (C40)', () => {
    const failures: Array<[string, Reply]> = [
      ['an HTTP 500', { status: 500, body: { errors: [] } }],
      ['an HTTP 400', { status: 400, body: { errors: [{ code: 'invalid' }] } }],
      ['a network error', 'network'],
      ['no answer within the timeout', 'hang'],
    ];

    it.each(failures)('createCardCheckout with %s (C40)', async (_, reply) => {
      const { gateway } = setup({ 'POST /checkouts': reply });
      await expect(
        gateway.createCardCheckout(cardRequest),
      ).rejects.toBeInstanceOf(PaymentGatewayUnavailableError);
    });

    it.each(failures)(
      'createPixSubscription with %s (C40)',
      async (_, reply) => {
        const { gateway } = setup({ ...PIX_OK, 'POST /subscriptions': reply });
        await expect(
          gateway.createPixSubscription(pixRequest),
        ).rejects.toBeInstanceOf(PaymentGatewayUnavailableError);
      },
    );

    it.each(failures)('cancelSubscription with %s (C40)', async (_, reply) => {
      const { gateway } = setup({ 'DELETE /subscriptions/sub_1': reply });
      await expect(gateway.cancelSubscription('sub_1')).rejects.toBeInstanceOf(
        PaymentGatewayUnavailableError,
      );
    });

    it('createPixSubscription without an invoice cancels the subscription it created (C40)', async () => {
      const { gateway, requests } = setup({
        ...PIX_OK,
        'GET /subscriptions/sub_1/payments': {
          status: 200,
          body: { data: [] },
        },
      });

      await expect(
        gateway.createPixSubscription(pixRequest),
      ).rejects.toBeInstanceOf(PaymentGatewayUnavailableError);
      expect(requests[requests.length - 1].method).toBe('DELETE');
    });
  });

  it.each<
    [
      string,
      Record<string, unknown>,
      { barbershopId: string | null; checkoutId: string | null },
    ]
  >([
    [
      'the reference',
      { id: 'sub_1', externalReference: SHOP, checkoutSession: null },
      { barbershopId: SHOP, checkoutId: null },
    ],
    [
      'the checkout session',
      { id: 'sub_1', externalReference: null, checkoutSession: 'chk_1' },
      { barbershopId: null, checkoutId: 'chk_1' },
    ],
    [
      'a reference that is not ours',
      { id: 'sub_1', externalReference: 'pedido-42' },
      { barbershopId: null, checkoutId: null },
    ],
  ])(
    'AC 10: the owner of a subscription comes from %s (C40)',
    async (_, body, expected) => {
      const { gateway, requests } = setup({
        'GET /subscriptions/sub_1': { status: 200, body },
      });

      expect(await gateway.findSubscriptionBarbershop('sub_1')).toEqual(
        expected,
      );
      expect(requests[0].url).toBe('http://asaas.test/v3/subscriptions/sub_1');
    },
  );

  it('AC 11: a subscription the gateway does not know has no owner (C40)', async () => {
    const { gateway } = setup({
      'GET /subscriptions/sub_9': { status: 404, body: {} },
    });

    expect(await gateway.findSubscriptionBarbershop('sub_9')).toBeNull();
  });

  it('AC 33: each call logs its operation, duration and status, never the document, key or body (C41)', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { gateway } = setup({ ...PIX_OK, 'POST /checkouts': 'network' });

    await gateway.createPixSubscription(pixRequest);
    await gateway.createCardCheckout(cardRequest).catch(() => undefined);

    expect(log).toHaveBeenCalledTimes(3);
    for (const [fields] of log.mock.calls) {
      expect(fields).toEqual({
        operation: 'createPixSubscription',
        method: expect.any(String) as string,
        durationMs: expect.any(Number) as number,
        status: 200,
      });
    }
    expect(warn).toHaveBeenCalledWith(
      {
        operation: 'createCardCheckout',
        method: 'POST',
        durationMs: expect.any(Number) as number,
        err: { name: 'TypeError' },
      },
      'Asaas call failed.',
    );
    const logged = JSON.stringify([...log.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain(CPF);
    expect(logged).not.toContain('asaas-secret-key');
    expect(logged).not.toContain('ana@barbearia.test');
  });
});

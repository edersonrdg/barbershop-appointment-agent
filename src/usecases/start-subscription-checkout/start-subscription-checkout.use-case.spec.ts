import { SubscriptionStatus } from '../../domain/entities/barbershop';
import { PaymentGatewayUnavailableError } from '../../domain/errors/payment-gateway-unavailable.error';
import { SubscriptionAlreadyExistsError } from '../../domain/errors/subscription-already-exists.error';
import { FakePaymentGateway } from '../testing/fake-payment-gateway';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { SettableClock } from '../testing/settable-clock';
import {
  APP_WEB_URL,
  OWNER_ID,
  PRICE_CENTS,
  SHOP_ID,
  SUBSCRIPTION_NOW,
  SubscriptionScenario,
  subscriptionScenario,
} from '../testing/subscription-fixtures';
import { StartSubscriptionCheckoutUseCase } from './start-subscription-checkout.use-case';

const CPF = '529.982.247-25';

describe('US-20 start subscription checkout', () => {
  let scenario: SubscriptionScenario;
  let gateway: FakePaymentGateway;
  let clock: SettableClock;

  function setup(
    overrides: Parameters<typeof subscriptionScenario>[0] = {},
    timezone = 'America/Sao_Paulo',
  ): StartSubscriptionCheckoutUseCase {
    scenario = subscriptionScenario(overrides, timezone);
    gateway = new FakePaymentGateway();
    clock = new SettableClock(SUBSCRIPTION_NOW);
    return new StartSubscriptionCheckoutUseCase(
      scenario.subscriptions,
      new InMemoryBarbershopRepository(scenario.store),
      new InMemoryUserRepository(scenario.store),
      gateway,
      clock,
      { priceCents: PRICE_CENTS, appWebUrl: APP_WEB_URL },
    );
  }

  const card = {
    barbershopId: SHOP_ID,
    userId: OWNER_ID,
    method: 'credit_card',
  } as const;
  const pix = {
    barbershopId: SHOP_ID,
    userId: OWNER_ID,
    method: 'pix',
    cpfCnpj: CPF,
  } as const;

  it('CA-20.1: a card checkout starts at the gateway and the barbershop stays in trial (C3)', async () => {
    const useCase = setup();

    const result = await useCase.execute(card);

    expect(gateway.cardCheckouts).toEqual([
      {
        barbershopId: SHOP_ID,
        priceCents: 9900,
        firstDueDate: '2026-10-02',
        returnUrl: 'http://painel.test/assinatura',
      },
    ]);
    expect(result).toEqual({
      paymentUrl: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_1',
    });
    const stored = scenario.subscriptions.get(SHOP_ID);
    expect(stored.gatewayCheckoutId).toBe('chk_1');
    expect(stored.paymentMethod).toBe('credit_card');
    expect(stored.status).toBe('trialing');
  });

  it.each([
    ['America/Sao_Paulo', '2026-10-03T02:30:00.000Z'],
    ['America/Manaus', '2026-10-03T03:30:00.000Z'],
  ])(
    'AC 1, AC 2: the first due date is today in %s (C4)',
    async (timezone, now) => {
      const useCase = setup({}, timezone);
      clock.current = new Date(now);

      await useCase.execute(card);
      await useCase.execute({ ...pix });

      expect(gateway.cardCheckouts[0].firstDueDate).toBe('2026-10-02');
      expect(gateway.pixSubscriptions[0].firstDueDate).toBe('2026-10-02');
    },
  );

  it('CA-20.1: a Pix subscription is created with the payer document and the first invoice is returned (C5)', async () => {
    const useCase = setup();

    const result = await useCase.execute(pix);

    expect(gateway.pixSubscriptions).toEqual([
      {
        barbershopId: SHOP_ID,
        priceCents: 9900,
        firstDueDate: '2026-10-02',
        payer: {
          name: 'Ana Souza',
          email: 'ana@barbearia.test',
          cpfCnpj: '52998224725',
        },
      },
    ]);
    expect(result).toEqual({ paymentUrl: 'https://sandbox.asaas.com/i/pay_1' });
    const stored = scenario.subscriptions.get(SHOP_ID);
    expect(stored.gatewaySubscriptionId).toBe('sub_1');
    expect(stored.gatewayCustomerId).toBe('cus_1');
    expect(stored.paymentMethod).toBe('pix');
    expect(stored.status).toBe('trialing');
    const persisted = JSON.stringify({
      ...Object.fromEntries(
        Object.getOwnPropertyNames(Object.getPrototypeOf(stored))
          .filter((name) => name !== 'constructor')
          .map((name) => [
            name,
            (stored as unknown as Record<string, unknown>)[name],
          ]),
      ),
    });
    expect(persisted).not.toContain('52998224725');
  });

  it('AC 3: a new Pix checkout cancels the unpaid Pix subscription first (C6)', async () => {
    const useCase = setup({
      paymentMethod: 'pix',
      gatewayCustomerId: 'cus_0',
      gatewaySubscriptionId: 'sub_0',
    });

    await useCase.execute(pix);

    expect(gateway.cancelled).toEqual(['sub_0']);
    expect(gateway.pixSubscriptions).toHaveLength(1);
    expect(scenario.subscriptions.get(SHOP_ID).gatewaySubscriptionId).toBe(
      'sub_1',
    );
  });

  it('AC 3: when cancelling the unpaid Pix subscription fails, nothing is created (C6)', async () => {
    const useCase = setup({
      paymentMethod: 'pix',
      gatewayCustomerId: 'cus_0',
      gatewaySubscriptionId: 'sub_0',
    });
    gateway.failing.add('cancelSubscription');

    await expect(useCase.execute(pix)).rejects.toBeInstanceOf(
      PaymentGatewayUnavailableError,
    );
    expect(gateway.pixSubscriptions).toHaveLength(0);
    expect(scenario.subscriptions.get(SHOP_ID).gatewaySubscriptionId).toBe(
      'sub_0',
    );
  });

  it.each<[SubscriptionStatus]>([['active'], ['past_due']])(
    'AC 7: a barbershop %s already has a subscription and the gateway is not called (C7)',
    async (status) => {
      const useCase = setup({ status, gatewaySubscriptionId: 'sub_1' });

      for (const input of [card, pix]) {
        const attempt = useCase.execute(input);
        await expect(attempt).rejects.toBeInstanceOf(
          SubscriptionAlreadyExistsError,
        );
        await expect(attempt).rejects.toThrow(
          'Esta barbearia já tem uma assinatura.',
        );
      }
      expect(gateway.calls).toBe(0);
    },
  );

  it('AC 7: a barbershop in trial goes on to the gateway (C7)', async () => {
    const useCase = setup({ status: 'trialing' });

    await useCase.execute(card);

    expect(gateway.calls).toBe(1);
  });

  it.each([
    ['createCardCheckout', card],
    ['createPixSubscription', pix],
  ] as const)(
    'AC 8: when %s fails the error goes up and nothing is stored (C8)',
    async (operation, input) => {
      const useCase = setup();
      gateway.failing.add(operation);

      await expect(useCase.execute(input)).rejects.toBeInstanceOf(
        PaymentGatewayUnavailableError,
      );
      const stored = scenario.subscriptions.get(SHOP_ID);
      expect(stored.status).toBe('trialing');
      expect(stored.paymentMethod).toBeNull();
      expect(stored.gatewayCheckoutId).toBeNull();
      expect(stored.gatewaySubscriptionId).toBeNull();
    },
  );
});

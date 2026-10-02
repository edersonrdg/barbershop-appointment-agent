import { SubscriptionStatus } from '../../domain/entities/barbershop';
import { CountingPaymentMetrics } from '../testing/counting-payment-metrics';
import { FakeEmailSender } from '../testing/fake-email-sender';
import { FakePaymentGateway } from '../testing/fake-payment-gateway';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { SettableClock } from '../testing/settable-clock';
import {
  ACTIVE,
  INVOICE_URL,
  ownerOf,
  SHOP_ID,
  SUBSCRIPTION_NOW,
  SubscriptionScenario,
  subscriptionScenario,
} from '../testing/subscription-fixtures';
import {
  ApplyPaymentEventUseCase,
  PaymentEvent,
} from './apply-payment-event.use-case';

const FAILURE_SUBJECT = 'Não conseguimos cobrar sua assinatura';
const FAILURE_TEXT =
  'Olá, Ana Souza! Não conseguimos cobrar a assinatura da Barbearia do Zé. Para continuar usando, faça o pagamento por este link: https://sandbox.asaas.com/i/pay_1';

describe('US-20 apply payment event', () => {
  let scenario: SubscriptionScenario;
  let gateway: FakePaymentGateway;
  let emailSender: FakeEmailSender;
  let metrics: CountingPaymentMetrics;
  let sequence: number;

  function setup(
    overrides: Parameters<typeof subscriptionScenario>[0] = {},
  ): ApplyPaymentEventUseCase {
    scenario = subscriptionScenario(overrides);
    gateway = new FakePaymentGateway();
    emailSender = new FakeEmailSender();
    metrics = new CountingPaymentMetrics();
    sequence = 0;
    return new ApplyPaymentEventUseCase(
      scenario.subscriptions,
      gateway,
      new InMemoryBarbershopRepository(scenario.store),
      new InMemoryUserRepository(scenario.store),
      emailSender,
      metrics,
      new SettableClock(SUBSCRIPTION_NOW),
    );
  }

  function event(
    kind: PaymentEvent['kind'],
    dueDate: string,
    gatewaySubscriptionId = 'sub_1',
  ): PaymentEvent {
    sequence += 1;
    return {
      gateway: 'asaas',
      eventId: `evt_${sequence}`,
      kind,
      gatewaySubscriptionId,
      dueDate,
      invoiceUrl: INVOICE_URL,
    };
  }

  const stored = () => scenario.subscriptions.get(SHOP_ID);

  it('CA-20.1: a confirmed payment activates the barbershop for one month and never shrinks it (C12)', async () => {
    const useCase = setup({ gatewaySubscriptionId: 'sub_1' });

    const first = await useCase.execute(
      event('payment_confirmed', '2026-10-02'),
    );
    expect(first.outcome).toBe('applied');
    expect(stored().status).toBe('active');
    expect(stored().paidUntil).toBe('2026-11-02');

    await useCase.execute(event('payment_confirmed', '2026-10-02'));
    expect(stored().paidUntil).toBe('2026-11-02');

    await useCase.execute(event('payment_confirmed', '2026-09-02'));
    expect(stored().paidUntil).toBe('2026-11-02');
  });

  it('AC 10: an unknown subscription is linked through the gateway by its checkout (C13)', async () => {
    const useCase = setup({
      paymentMethod: 'credit_card',
      gatewayCheckoutId: 'chk_1',
    });
    gateway.owners.set('sub_1', { barbershopId: null, checkoutId: 'chk_1' });

    const result = await useCase.execute(
      event('payment_confirmed', '2026-10-02'),
    );

    expect(gateway.lookups).toEqual(['sub_1']);
    expect(result.outcome).toBe('applied');
    expect(stored().gatewaySubscriptionId).toBe('sub_1');
    expect(stored().status).toBe('active');
  });

  it('AC 10: an unknown subscription is linked through the gateway by its reference (C13)', async () => {
    const useCase = setup({ paymentMethod: 'pix' });
    gateway.owners.set('sub_1', { barbershopId: SHOP_ID, checkoutId: null });

    const result = await useCase.execute(
      event('payment_confirmed', '2026-10-02'),
    );

    expect(result.outcome).toBe('applied');
    expect(stored().gatewaySubscriptionId).toBe('sub_1');
  });

  it('AC 11: a subscription nobody owns changes nothing (C13)', async () => {
    const useCase = setup({ gatewayCheckoutId: 'chk_1' });

    const result = await useCase.execute(
      event('payment_confirmed', '2026-10-02'),
    );

    expect(result.outcome).toBe('ignored');
    expect(stored().status).toBe('trialing');
    expect(stored().gatewaySubscriptionId).toBeNull();
    expect(scenario.subscriptions.events.size).toBe(0);
  });

  it('CA-20.3: a failed charge of an unpaid month makes an active barbershop past due and e-mails each Owner (C30)', async () => {
    const useCase = setup(ACTIVE);
    scenario.store.users.push(
      ownerOf(
        SHOP_ID,
        '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
        'Bia Lima',
        'bia@barbearia.test',
      ),
    );

    const result = await useCase.execute(event('payment_failed', '2026-11-02'));

    expect(result).toEqual({
      outcome: 'applied',
      barbershopId: SHOP_ID,
      email: { outcome: 'sent' },
    });
    expect(stored().status).toBe('past_due');
    expect(stored().paymentFailedAt).toEqual(SUBSCRIPTION_NOW);
    expect(stored().paymentIssueUrl).toBe(INVOICE_URL);
    expect(
      [...emailSender.sent].sort((a, b) => a.to.localeCompare(b.to)),
    ).toEqual([
      {
        to: 'ana@barbearia.test',
        subject: FAILURE_SUBJECT,
        text: FAILURE_TEXT,
      },
      {
        to: 'bia@barbearia.test',
        subject: FAILURE_SUBJECT,
        text: FAILURE_TEXT.replace('Ana Souza', 'Bia Lima'),
      },
    ]);
  });

  it('AC 24: a failure of an already paid month is ignored (C31)', async () => {
    const useCase = setup(ACTIVE);

    const result = await useCase.execute(event('payment_failed', '2026-11-01'));

    expect(result.outcome).toBe('ignored');
    expect(stored().status).toBe('active');
    expect(stored().paymentFailedAt).toBeNull();
    expect(emailSender.sent).toHaveLength(0);
  });

  it.each<[SubscriptionStatus, Date | null]>([
    ['trialing', null],
    ['past_due', new Date('2026-10-01T10:00:00.000Z')],
  ])(
    'AC 25: a failure while %s is ignored (C32)',
    async (status, paymentFailedAt) => {
      const useCase = setup({
        ...ACTIVE,
        status,
        paymentFailedAt,
        paymentIssueUrl: paymentFailedAt
          ? 'https://sandbox.asaas.com/i/pay_0'
          : null,
      });

      const result = await useCase.execute(
        event('payment_failed', '2026-11-02'),
      );

      expect(result.outcome).toBe('ignored');
      expect(stored().status).toBe(status);
      expect(stored().paymentFailedAt).toEqual(paymentFailedAt);
      expect(emailSender.sent).toHaveLength(0);
    },
  );

  it('AC 26: a confirmed payment while past due reactivates and clears the failure (C33)', async () => {
    const useCase = setup({
      ...ACTIVE,
      status: 'past_due',
      paymentFailedAt: new Date('2026-10-01T10:00:00.000Z'),
      paymentIssueUrl: INVOICE_URL,
    });

    await useCase.execute(event('payment_confirmed', '2026-11-02'));

    expect(stored().status).toBe('active');
    expect(stored().paidUntil).toBe('2026-12-02');
    expect(stored().paymentIssueUrl).toBeNull();
    expect(stored().paymentFailedAt).toBeNull();
  });

  it('AC 27: when the failure e-mail cannot be sent, past due stays recorded and the error comes back (C34)', async () => {
    const useCase = setup(ACTIVE);
    const failure = new Error('smtp down');
    emailSender.failure = failure;

    const result = await useCase.execute(event('payment_failed', '2026-11-02'));

    expect(result.outcome).toBe('applied');
    expect(result.email).toEqual({ outcome: 'failed', error: failure });
    expect(stored().status).toBe('past_due');
  });
});

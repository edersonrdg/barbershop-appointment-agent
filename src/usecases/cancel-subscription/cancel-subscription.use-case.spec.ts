import { BarbershopSubscriptionProps } from '../../domain/entities/barbershop-subscription';
import { NoActiveSubscriptionError } from '../../domain/errors/no-active-subscription.error';
import { PaymentGatewayUnavailableError } from '../../domain/errors/payment-gateway-unavailable.error';
import { FakePaymentGateway } from '../testing/fake-payment-gateway';
import { SettableClock } from '../testing/settable-clock';
import {
  ACTIVE,
  SHOP_ID,
  SUBSCRIPTION_NOW,
  SubscriptionScenario,
  subscriptionScenario,
} from '../testing/subscription-fixtures';
import { CancelSubscriptionUseCase } from './cancel-subscription.use-case';

describe('US-20 cancel subscription', () => {
  let scenario: SubscriptionScenario;
  let gateway: FakePaymentGateway;

  function setup(
    overrides: Partial<BarbershopSubscriptionProps>,
  ): CancelSubscriptionUseCase {
    scenario = subscriptionScenario(overrides);
    gateway = new FakePaymentGateway();
    return new CancelSubscriptionUseCase(
      scenario.subscriptions,
      gateway,
      new SettableClock(SUBSCRIPTION_NOW),
    );
  }

  const stored = () => scenario.subscriptions.get(SHOP_ID);

  it('CA-20.4: cancelling stops the gateway subscription and keeps the barbershop active until the paid date (C36)', async () => {
    const useCase = setup(ACTIVE);

    const result = await useCase.execute({ barbershopId: SHOP_ID });

    expect(gateway.cancelled).toEqual(['sub_1']);
    expect(result).toEqual({ cancelsAt: '2026-11-02' });
    expect(stored().cancelRequestedAt).toEqual(SUBSCRIPTION_NOW);
    expect(stored().status).toBe('active');
  });

  it.each<[string, Partial<BarbershopSubscriptionProps>]>([
    ['trialing', { status: 'trialing' }],
    ['past_due', { ...ACTIVE, status: 'past_due' }],
    [
      'already cancelled',
      { ...ACTIVE, cancelRequestedAt: new Date('2026-10-01T10:00:00.000Z') },
    ],
  ])(
    'AC 30: a barbershop %s has nothing to cancel and the gateway is not called (C37)',
    async (_label, overrides) => {
      const useCase = setup(overrides);

      const attempt = useCase.execute({ barbershopId: SHOP_ID });

      await expect(attempt).rejects.toBeInstanceOf(NoActiveSubscriptionError);
      await expect(attempt).rejects.toThrow(
        'Não há assinatura ativa para cancelar.',
      );
      expect(gateway.calls).toBe(0);
    },
  );

  it('AC 31: when the gateway fails, the cancellation is not recorded (C37)', async () => {
    const useCase = setup(ACTIVE);
    gateway.failing.add('cancelSubscription');

    await expect(
      useCase.execute({ barbershopId: SHOP_ID }),
    ).rejects.toBeInstanceOf(PaymentGatewayUnavailableError);
    expect(stored().cancelRequestedAt).toBeNull();
  });
});

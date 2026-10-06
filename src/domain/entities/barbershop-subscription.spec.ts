import { BarbershopTimezone } from '../value-objects/barbershop-timezone';
import {
  BarbershopSubscription,
  BarbershopSubscriptionProps,
} from './barbershop-subscription';

const NOW = new Date('2026-10-02T15:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function subscription(
  overrides: Partial<BarbershopSubscriptionProps> = {},
): BarbershopSubscription {
  return BarbershopSubscription.restore({
    barbershopId: '0b9f7d8e-8a55-4c1c-9d51-6f2f3d1f0a11',
    timezone: BarbershopTimezone.create('America/Sao_Paulo'),
    status: 'trialing',
    trialEndsAt: new Date(NOW.getTime() + 2 * DAY_MS),
    paymentMethod: null,
    gatewayCustomerId: null,
    gatewaySubscriptionId: null,
    gatewayCheckoutId: null,
    paidUntil: null,
    cancelRequestedAt: null,
    paymentFailedAt: null,
    paymentIssueUrl: null,
    ...overrides,
  });
}

function pastDue(failedAgoMs: number): BarbershopSubscription {
  return subscription({
    status: 'past_due',
    paymentMethod: 'credit_card',
    gatewaySubscriptionId: 'sub_1',
    paidUntil: '2026-10-02',
    paymentFailedAt: new Date(NOW.getTime() - failedAgoMs),
    paymentIssueUrl: 'https://sandbox.asaas.com/i/pay_2',
  });
}

function cancelled(
  paidUntil: string,
  timezone = 'America/Sao_Paulo',
): BarbershopSubscription {
  return subscription({
    timezone: BarbershopTimezone.create(timezone),
    status: 'active',
    paymentMethod: 'credit_card',
    gatewaySubscriptionId: 'sub_1',
    paidUntil,
    cancelRequestedAt: new Date('2026-09-10T12:00:00.000Z'),
  });
}

describe('US-21 BarbershopSubscription suspension', () => {
  it('AC 1, AC 6 (C1): a trial is suspended from the instant it ends, not a millisecond before', () => {
    expect(subscription({ trialEndsAt: NOW }).suspensionReason(NOW, 5)).toBe(
      'trial_ended',
    );
    expect(
      subscription({
        trialEndsAt: new Date(NOW.getTime() + 1),
      }).suspensionReason(NOW, 5),
    ).toBeNull();
  });

  it('CA-21.3, AC 2, AC 3 (C2): a failed payment is suspended once the 5-day grace is over', () => {
    expect(pastDue(5 * DAY_MS).suspensionReason(NOW, 5)).toBe(
      'payment_overdue',
    );
    expect(pastDue(5 * DAY_MS - 1).suspensionReason(NOW, 5)).toBeNull();
  });

  it('AC 2, AC 3 (C3): the configured grace decides, not a fixed 5 days', () => {
    expect(pastDue(2 * DAY_MS).suspensionReason(NOW, 2)).toBe(
      'payment_overdue',
    );
    expect(pastDue(47 * HOUR_MS).suspensionReason(NOW, 2)).toBeNull();
    expect(pastDue(0).suspensionReason(NOW, 0)).toBe('payment_overdue');
  });

  it('AC 4, AC 5 (C4): a cancelled subscription is suspended from the local day after cancelsAt', () => {
    const paid = cancelled('2026-11-02');
    expect(
      paid.suspensionReason(new Date('2026-11-03T02:59:59.999Z'), 5),
    ).toBeNull();
    expect(paid.suspensionReason(new Date('2026-11-03T03:00:00.000Z'), 5)).toBe(
      'subscription_ended',
    );
    expect(
      cancelled('2026-11-02', 'America/Manaus').suspensionReason(
        new Date('2026-11-03T03:30:00.000Z'),
        5,
      ),
    ).toBeNull();
  });

  it('AC 6 (C5): an active subscription without cancellation and a running trial are never suspended', () => {
    expect(
      subscription({
        status: 'active',
        paymentMethod: 'credit_card',
        gatewaySubscriptionId: 'sub_1',
        paidUntil: '2026-01-01',
      }).suspensionReason(NOW, 5),
    ).toBeNull();
    expect(
      subscription({
        trialEndsAt: new Date(NOW.getTime() + 10 * DAY_MS),
      }).suspensionReason(NOW, 5),
    ).toBeNull();
  });

  it('CA-21.4, AC 23 (C32): the first payment of a new subscription clears the old cancellation', () => {
    const ended = cancelled('2026-10-01');

    ended.confirmPayment('2026-10-02');

    expect(ended.status).toBe('active');
    expect(ended.cancelRequestedAt).toBeNull();
    expect(ended.cancelsAt).toBeNull();
    expect(ended.paidUntil).toBe('2026-11-02');
    expect(ended.nextChargeDate).toBe('2026-11-02');
    expect(ended.suspensionReason(NOW, 5)).toBeNull();
  });

  it('AC 25 (C35): a late confirmation of the cancelled subscription keeps it ended', () => {
    const ended = cancelled('2026-10-01');
    const requestedAt = ended.cancelRequestedAt;

    ended.confirmPayment('2026-09-01');

    expect(ended.cancelRequestedAt).toEqual(requestedAt);
    expect(ended.paidUntil).toBe('2026-10-01');
    expect(ended.suspensionReason(NOW, 5)).toBe('subscription_ended');
  });

  it('AC 25 (C35): a charge due on paidUntil itself, issued before the cancellation, extends the period and keeps it cancelled', () => {
    const ended = cancelled('2026-10-01');
    const requestedAt = ended.cancelRequestedAt;

    ended.confirmPayment('2026-10-01');

    expect(ended.cancelRequestedAt).toEqual(requestedAt);
    expect(ended.paidUntil).toBe('2026-11-01');
    expect(ended.cancelsAt).toBe('2026-11-01');
    expect(
      ended.suspensionReason(new Date('2026-11-02T03:00:00.000Z'), 5),
    ).toBe('subscription_ended');
  });

  it('AC 24 (C34): a cancelled subscription still in its paid period cannot start a checkout', () => {
    expect(cancelled('2026-10-02').canStartCheckout(NOW)).toBe(false);
  });

  it('AC 22: an ended subscription can start a checkout again', () => {
    expect(cancelled('2026-10-01').canStartCheckout(NOW)).toBe(true);
  });
});

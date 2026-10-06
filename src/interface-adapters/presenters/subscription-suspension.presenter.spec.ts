import { myAccountResponseSchema } from './my-account.presenter';
import { subscriptionResponseSchema } from './subscription.presenter';

const account = {
  user: {
    id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    name: 'Ana Souza',
    email: 'ana@barbearia.test',
    phone: '+5511912345678',
    role: 'owner',
  },
  barbershop: {
    id: '0b9f7d8e-8a55-4c1c-9d51-6f2f3d1f0a11',
    name: 'Barbearia do Zé',
    timezone: 'America/Sao_Paulo',
    subscriptionStatus: 'trialing',
    trialEndsAt: '2026-10-01T15:00:00.000Z',
  },
};

const subscription = {
  status: 'trialing',
  trialEndsAt: '2026-10-01T15:00:00.000Z',
  trialEndingSoon: false,
  priceCents: 9900,
  paymentMethod: null,
  paidUntil: null,
  nextChargeDate: null,
  cancelsAt: null,
  paymentIssueUrl: null,
};

function withAccountReason(reason?: unknown): unknown {
  const barbershop =
    reason === undefined
      ? account.barbershop
      : { ...account.barbershop, suspensionReason: reason };
  return { ...account, barbershop };
}

function withSubscriptionReason(reason?: unknown): unknown {
  return reason === undefined
    ? subscription
    : { ...subscription, suspensionReason: reason };
}

describe('US-21 suspensionReason in the response contract', () => {
  it.each(['trial_ended', 'payment_overdue', 'subscription_ended', null])(
    'door 3 (C27): accepts %s on GET /me and GET /subscription',
    (reason) => {
      expect(
        myAccountResponseSchema.safeParse(withAccountReason(reason)).success,
      ).toBe(true);
      expect(
        subscriptionResponseSchema.safeParse(withSubscriptionReason(reason))
          .success,
      ).toBe(true);
    },
  );

  it.each([['suspended'], [undefined]])(
    'door 3 (C27): refuses %s on GET /me and GET /subscription',
    (reason) => {
      expect(
        myAccountResponseSchema.safeParse(withAccountReason(reason)).success,
      ).toBe(false);
      expect(
        subscriptionResponseSchema.safeParse(withSubscriptionReason(reason))
          .success,
      ).toBe(false);
    },
  );
});

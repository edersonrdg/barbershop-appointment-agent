import { Barbershop } from '../../domain/entities/barbershop';
import {
  BarbershopSubscription,
  BarbershopSubscriptionProps,
} from '../../domain/entities/barbershop-subscription';
import { User } from '../../domain/entities/user';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { WeeklyOpeningHours } from '../../domain/value-objects/weekly-opening-hours';
import { InMemoryAccountStore } from './in-memory-account-store';
import { InMemorySubscriptionRepository } from './in-memory-subscription.repository';

// Friday 2026-10-02, 12:00 in São Paulo; the trial ends two days later.
export const SUBSCRIPTION_NOW = new Date('2026-10-02T15:00:00.000Z');
export const TRIAL_ENDS_AT = new Date('2026-10-04T15:00:00.000Z');
export const PRICE_CENTS = 9900;
export const WARNING_DAYS = 3;
export const APP_WEB_URL = 'http://painel.test';
export const SHOP_ID = '0b9f7d8e-8a55-4c1c-9d51-6f2f3d1f0a11';
export const OTHER_SHOP_ID = '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
export const OWNER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
export const BARBER_USER_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
export const INVOICE_URL = 'https://sandbox.asaas.com/i/pay_1';

/** The "ativa" barbershop of the checks: card, `sub_1`, paid until 2026-11-02. */
export const ACTIVE: Partial<BarbershopSubscriptionProps> = {
  status: 'active',
  paymentMethod: 'credit_card',
  gatewaySubscriptionId: 'sub_1',
  gatewayCheckoutId: 'chk_1',
  paidUntil: '2026-11-02',
};

export function subscriptionOf(
  overrides: Partial<BarbershopSubscriptionProps> = {},
): BarbershopSubscription {
  return BarbershopSubscription.restore({
    barbershopId: SHOP_ID,
    status: 'trialing',
    trialEndsAt: TRIAL_ENDS_AT,
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

export function barbershopOf(
  id: string,
  name = 'Barbearia do Zé',
  timezone = 'America/Sao_Paulo',
): Barbershop {
  return Barbershop.restore({
    id,
    name,
    address: 'Rua das Flores, 123',
    timezone: BarbershopTimezone.create(timezone),
    openingHours: WeeklyOpeningHours.allClosed(),
    subscriptionStatus: 'trialing',
    trialEndsAt: TRIAL_ENDS_AT,
    createdAt: new Date('2026-09-20T12:00:00.000Z'),
  });
}

export function ownerOf(
  barbershopId: string,
  id: string,
  name: string,
  email: string,
): User {
  return User.restore({
    id,
    barbershopId,
    name,
    email,
    phone: '+5511912345678',
    passwordHash: 'hash',
    role: 'owner',
    createdAt: new Date('2026-09-20T12:00:00.000Z'),
  });
}

export function barberOf(barbershopId: string, id: string): User {
  return User.restore({
    id,
    barbershopId,
    name: 'João',
    email: 'joao@barbearia.test',
    phone: null,
    passwordHash: 'hash',
    role: 'barber',
    createdAt: new Date('2026-09-20T12:00:00.000Z'),
  });
}

export interface SubscriptionScenario {
  store: InMemoryAccountStore;
  subscriptions: InMemorySubscriptionRepository;
}

/** "Barbearia do Zé" with the Owner Ana Souza and the barber João. */
export function subscriptionScenario(
  overrides: Partial<BarbershopSubscriptionProps> = {},
  timezone = 'America/Sao_Paulo',
): SubscriptionScenario {
  const store = new InMemoryAccountStore();
  store.barbershops.push(barbershopOf(SHOP_ID, 'Barbearia do Zé', timezone));
  store.users.push(
    ownerOf(SHOP_ID, OWNER_ID, 'Ana Souza', 'ana@barbearia.test'),
    barberOf(SHOP_ID, BARBER_USER_ID),
  );
  const subscriptions = new InMemorySubscriptionRepository();
  subscriptions.add(subscriptionOf(overrides));
  return { store, subscriptions };
}

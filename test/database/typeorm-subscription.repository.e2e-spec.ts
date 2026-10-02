import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmSubscriptionRepository } from '../../src/infrastructure/database/repositories/typeorm-subscription.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-10-02T15:00:00.000Z');
const TRIAL_ENDS_AT = new Date('2026-10-04T15:00:00.000Z');

describe('US-20 TypeOrmSubscriptionRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmSubscriptionRepository;
  let shopA: string;
  let shopB: string;

  function insertShop(id: string, status = 'trialing'): Promise<unknown> {
    return dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', $2, $3, now())`,
      [id, status, TRIAL_ENDS_AT],
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmSubscriptionRepository(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    shopA = randomUUID();
    shopB = randomUUID();
    await insertShop(shopA);
    await insertShop(shopB);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('door 1: a saved subscription reads back with every field (C44)', async () => {
    await repository.withLock(shopA, (subscription) => {
      subscription.startPixSubscription({
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
      });
      subscription.confirmPayment('2026-10-02');
      subscription.failPayment({
        dueDate: '2026-11-02',
        invoiceUrl: 'https://sandbox.asaas.com/i/pay_2',
        now: NOW,
      });
      return Promise.resolve({ save: true, result: undefined });
    });

    const read = await repository.findByBarbershopId(shopA);

    expect(read).not.toBeNull();
    expect({
      barbershopId: read?.barbershopId,
      status: read?.status,
      trialEndsAt: read?.trialEndsAt,
      paymentMethod: read?.paymentMethod,
      gatewayCustomerId: read?.gatewayCustomerId,
      gatewaySubscriptionId: read?.gatewaySubscriptionId,
      gatewayCheckoutId: read?.gatewayCheckoutId,
      paidUntil: read?.paidUntil,
      cancelRequestedAt: read?.cancelRequestedAt,
      paymentFailedAt: read?.paymentFailedAt,
      paymentIssueUrl: read?.paymentIssueUrl,
    }).toEqual({
      barbershopId: shopA,
      status: 'past_due',
      trialEndsAt: TRIAL_ENDS_AT,
      paymentMethod: 'pix',
      gatewayCustomerId: 'cus_1',
      gatewaySubscriptionId: 'sub_1',
      gatewayCheckoutId: null,
      paidUntil: '2026-11-02',
      cancelRequestedAt: null,
      paymentFailedAt: NOW,
      paymentIssueUrl: 'https://sandbox.asaas.com/i/pay_2',
    });
  });

  it('door 6: the barbershop is found by its gateway subscription or checkout, across tenants (C44)', async () => {
    await repository.withLock(shopA, (subscription) => {
      subscription.startCardCheckout('chk_a');
      return Promise.resolve({ save: true, result: undefined });
    });
    await repository.withLock(shopB, (subscription) => {
      subscription.startPixSubscription({
        customerId: 'cus_b',
        subscriptionId: 'sub_b',
      });
      return Promise.resolve({ save: true, result: undefined });
    });

    expect(await repository.findBarbershopIdByCheckout('chk_a')).toBe(shopA);
    expect(
      await repository.findBarbershopIdByGatewaySubscription('sub_b'),
    ).toBe(shopB);
    expect(
      await repository.findBarbershopIdByGatewaySubscription('sub_x'),
    ).toBeNull();
  });

  it('door 7: the trial warning is claimed once, and never for an active barbershop (C44)', async () => {
    await dataSource.query(
      `UPDATE barbershops SET subscription_status = 'active' WHERE id = $1`,
      [shopB],
    );

    expect(await repository.claimTrialWarning(shopA, NOW)).toBe(true);
    expect(await repository.claimTrialWarning(shopA, NOW)).toBe(false);
    expect(await repository.claimTrialWarning(shopB, NOW)).toBe(false);
  });

  it('RN-26: a work that throws leaves the subscription and the event unrecorded (C44)', async () => {
    const attempt = repository.recordEvent(
      { gateway: 'asaas', eventId: 'evt_1' },
      shopA,
      (subscription) => {
        subscription.startPixSubscription({
          customerId: 'cus_1',
          subscriptionId: 'sub_1',
        });
        return Promise.reject(new Error('boom'));
      },
    );

    await expect(attempt).rejects.toThrow('boom');
    expect(
      await repository.hasEvent({ gateway: 'asaas', eventId: 'evt_1' }),
    ).toBe(false);
    expect(
      (await repository.findByBarbershopId(shopA))?.paymentMethod,
    ).toBeNull();
  });
});

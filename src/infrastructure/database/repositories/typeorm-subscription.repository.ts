import { DataSource, EntityManager } from 'typeorm';
import { SubscriptionStatus } from '../../../domain/entities/barbershop';
import { BarbershopSubscription } from '../../../domain/entities/barbershop-subscription';
import { BarbershopTimezone } from '../../../domain/value-objects/barbershop-timezone';
import {
  PaymentEventKey,
  RecordedEvent,
  SubscriptionRepository,
  SubscriptionWork,
} from '../../../usecases/ports/subscription.repository.port';
import { BarbershopSubscriptionEntity } from '../entities/barbershop-subscription.entity';
import { BarbershopEntity } from '../entities/barbershop.entity';
import { PaymentGatewayEventEntity } from '../entities/payment-gateway-event.entity';

export class TypeOrmSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly dataSource: DataSource) {}

  findByBarbershopId(
    barbershopId: string,
  ): Promise<BarbershopSubscription | null> {
    return load(this.dataSource.manager, barbershopId);
  }

  withLock<T>(barbershopId: string, work: SubscriptionWork<T>): Promise<T> {
    return this.dataSource.transaction((manager) =>
      runLocked(manager, barbershopId, work),
    );
  }

  // Door 2: a concurrent delivery of the same event waits on the primary key
  // until this transaction ends, then finds it and runs nothing.
  recordEvent<T>(
    event: PaymentEventKey,
    barbershopId: string,
    work: SubscriptionWork<T>,
  ): Promise<RecordedEvent<T>> {
    return this.dataSource.transaction(async (manager) => {
      const inserted = await manager.query<unknown[]>(
        `INSERT INTO payment_gateway_events (gateway, event_id, barbershop_id, received_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT DO NOTHING
         RETURNING event_id`,
        [event.gateway, event.eventId, barbershopId],
      );
      if (inserted.length === 0) return { duplicate: true };
      return {
        duplicate: false,
        result: await runLocked(manager, barbershopId, work),
      };
    });
  }

  async hasEvent(event: PaymentEventKey): Promise<boolean> {
    return this.dataSource
      .getRepository(PaymentGatewayEventEntity)
      .existsBy({ gateway: event.gateway, eventId: event.eventId });
  }

  async findBarbershopIdByGatewaySubscription(
    gatewaySubscriptionId: string,
  ): Promise<string | null> {
    const row = await this.dataSource
      .getRepository(BarbershopSubscriptionEntity)
      .findOneBy({ gatewaySubscriptionId });
    return row?.barbershopId ?? null;
  }

  async findBarbershopIdByCheckout(checkoutId: string): Promise<string | null> {
    const row = await this.dataSource
      .getRepository(BarbershopSubscriptionEntity)
      .findOneBy({ gatewayCheckoutId: checkoutId });
    return row?.barbershopId ?? null;
  }

  async claimTrialWarning(barbershopId: string, now: Date): Promise<boolean> {
    const [, affected] = await this.dataSource.query<[unknown, number]>(
      `UPDATE barbershops SET trial_warning_sent_at = $2
       WHERE id = $1 AND trial_warning_sent_at IS NULL
         AND subscription_status = 'trialing'`,
      [barbershopId, now],
    );
    return affected === 1;
  }
}

// Door 8: the barbershop row always exists, unlike the subscription row before
// the first checkout, so it is the one that serialises the writers.
async function runLocked<T>(
  manager: EntityManager,
  barbershopId: string,
  work: SubscriptionWork<T>,
): Promise<T> {
  await manager.query('SELECT 1 FROM barbershops WHERE id = $1 FOR UPDATE', [
    barbershopId,
  ]);
  const subscription = await load(manager, barbershopId);
  if (!subscription) {
    throw new Error(`Barbershop ${barbershopId} does not exist.`);
  }
  const { save, result } = await work(subscription);
  if (save) await write(manager, subscription);
  return result;
}

async function load(
  manager: EntityManager,
  barbershopId: string,
): Promise<BarbershopSubscription | null> {
  const barbershop = await manager.findOneBy(BarbershopEntity, {
    id: barbershopId,
  });
  if (!barbershop) return null;
  const row = await manager.findOneBy(BarbershopSubscriptionEntity, {
    barbershopId,
  });
  return BarbershopSubscription.restore({
    barbershopId,
    timezone: BarbershopTimezone.create(barbershop.timezone),
    status: barbershop.subscriptionStatus as SubscriptionStatus,
    trialEndsAt: barbershop.trialEndsAt,
    paymentMethod: row?.paymentMethod ?? null,
    gatewayCustomerId: row?.gatewayCustomerId ?? null,
    gatewaySubscriptionId: row?.gatewaySubscriptionId ?? null,
    gatewayCheckoutId: row?.gatewayCheckoutId ?? null,
    paidUntil: row?.paidUntil ?? null,
    cancelRequestedAt: row?.cancelRequestedAt ?? null,
    paymentFailedAt: row?.paymentFailedAt ?? null,
    paymentIssueUrl: row?.paymentIssueUrl ?? null,
  });
}

async function write(
  manager: EntityManager,
  subscription: BarbershopSubscription,
): Promise<void> {
  await manager.update(
    BarbershopEntity,
    { id: subscription.barbershopId },
    { subscriptionStatus: subscription.status },
  );
  if (subscription.paymentMethod === null) return;
  await manager.upsert(
    BarbershopSubscriptionEntity,
    {
      barbershopId: subscription.barbershopId,
      paymentMethod: subscription.paymentMethod,
      gatewayCustomerId: subscription.gatewayCustomerId,
      gatewaySubscriptionId: subscription.gatewaySubscriptionId,
      gatewayCheckoutId: subscription.gatewayCheckoutId,
      paidUntil: subscription.paidUntil,
      cancelRequestedAt: subscription.cancelRequestedAt,
      paymentFailedAt: subscription.paymentFailedAt,
      paymentIssueUrl: subscription.paymentIssueUrl,
    },
    ['barbershopId'],
  );
}

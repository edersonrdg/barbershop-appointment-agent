import { BarbershopSubscription } from '../../domain/entities/barbershop-subscription';
import {
  PaymentEventKey,
  RecordedEvent,
  SubscriptionRepository,
  SubscriptionWork,
} from '../ports/subscription.repository.port';

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  readonly subscriptions = new Map<string, BarbershopSubscription>();
  readonly events = new Set<string>();
  readonly trialWarnings = new Map<string, Date>();
  private readonly locks = new Map<string, Promise<unknown>>();

  add(subscription: BarbershopSubscription): void {
    this.subscriptions.set(subscription.barbershopId, subscription);
  }

  get(barbershopId: string): BarbershopSubscription {
    const found = this.subscriptions.get(barbershopId);
    if (!found) throw new Error(`no subscription for ${barbershopId}`);
    return found;
  }

  findByBarbershopId(
    barbershopId: string,
  ): Promise<BarbershopSubscription | null> {
    const found = this.subscriptions.get(barbershopId);
    return Promise.resolve(found ? copy(found) : null);
  }

  // Works on a copy, so a work that throws leaves nothing changed, like a
  // rolled-back transaction.
  withLock<T>(barbershopId: string, work: SubscriptionWork<T>): Promise<T> {
    const previous = this.locks.get(barbershopId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const subscription = copy(this.get(barbershopId));
        const { save, result } = await work(subscription);
        if (save) this.subscriptions.set(barbershopId, subscription);
        return result;
      });
    this.locks.set(barbershopId, run);
    return run;
  }

  async recordEvent<T>(
    event: PaymentEventKey,
    barbershopId: string,
    work: SubscriptionWork<T>,
  ): Promise<RecordedEvent<T>> {
    const key = eventKey(event);
    if (this.events.has(key)) return { duplicate: true };
    this.events.add(key);
    try {
      return {
        duplicate: false,
        result: await this.withLock(barbershopId, work),
      };
    } catch (error) {
      this.events.delete(key);
      throw error;
    }
  }

  hasEvent(event: PaymentEventKey): Promise<boolean> {
    return Promise.resolve(this.events.has(eventKey(event)));
  }

  findBarbershopIdByGatewaySubscription(
    gatewaySubscriptionId: string,
  ): Promise<string | null> {
    const found = [...this.subscriptions.values()].find(
      (subscription) =>
        subscription.gatewaySubscriptionId === gatewaySubscriptionId,
    );
    return Promise.resolve(found?.barbershopId ?? null);
  }

  findBarbershopIdByCheckout(checkoutId: string): Promise<string | null> {
    const found = [...this.subscriptions.values()].find(
      (subscription) => subscription.gatewayCheckoutId === checkoutId,
    );
    return Promise.resolve(found?.barbershopId ?? null);
  }

  claimTrialWarning(barbershopId: string, now: Date): Promise<boolean> {
    const subscription = this.subscriptions.get(barbershopId);
    if (
      !subscription ||
      subscription.status !== 'trialing' ||
      this.trialWarnings.has(barbershopId)
    ) {
      return Promise.resolve(false);
    }
    this.trialWarnings.set(barbershopId, now);
    return Promise.resolve(true);
  }
}

function eventKey({ gateway, eventId }: PaymentEventKey): string {
  return `${gateway}:${eventId}`;
}

function copy(subscription: BarbershopSubscription): BarbershopSubscription {
  return BarbershopSubscription.restore({
    barbershopId: subscription.barbershopId,
    timezone: subscription.timezone,
    status: subscription.status,
    trialEndsAt: subscription.trialEndsAt,
    paymentMethod: subscription.paymentMethod,
    gatewayCustomerId: subscription.gatewayCustomerId,
    gatewaySubscriptionId: subscription.gatewaySubscriptionId,
    gatewayCheckoutId: subscription.gatewayCheckoutId,
    paidUntil: subscription.paidUntil,
    cancelRequestedAt: subscription.cancelRequestedAt,
    paymentFailedAt: subscription.paymentFailedAt,
    paymentIssueUrl: subscription.paymentIssueUrl,
  });
}

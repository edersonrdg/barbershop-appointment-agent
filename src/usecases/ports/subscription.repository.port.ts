import { BarbershopSubscription } from '../../domain/entities/barbershop-subscription';

export const SUBSCRIPTION_REPOSITORY = Symbol('SubscriptionRepository');

export interface PaymentEventKey {
  gateway: string;
  eventId: string;
}

/**
 * Runs while the barbershop is locked (door 8). `save: true` persists the
 * subscription as the work left it, in the same transaction.
 */
export type SubscriptionWork<T> = (
  subscription: BarbershopSubscription,
) => Promise<{ save: boolean; result: T }>;

export type RecordedEvent<T> =
  { duplicate: true } | { duplicate: false; result: T };

export interface SubscriptionRepository {
  /** Null when the barbershop does not exist. */
  findByBarbershopId(
    barbershopId: string,
  ): Promise<BarbershopSubscription | null>;
  /**
   * Locks the barbershop for the whole work, so two checkouts or a checkout
   * and a payment event never interleave. Throws when the barbershop does not
   * exist.
   */
  withLock<T>(barbershopId: string, work: SubscriptionWork<T>): Promise<T>;
  /**
   * Records the gateway event and runs the work for its barbershop in one
   * transaction (door 2): an event already recorded runs nothing, and a work
   * that throws leaves the event unrecorded so its redelivery applies it.
   */
  recordEvent<T>(
    event: PaymentEventKey,
    barbershopId: string,
    work: SubscriptionWork<T>,
  ): Promise<RecordedEvent<T>>;
  hasEvent(event: PaymentEventKey): Promise<boolean>;
  // RN-26 exception (door 6, like AD-011): a gateway webhook arrives without a
  // session, so the tenant comes from the ids the gateway gave us.
  findBarbershopIdByGatewaySubscription(
    gatewaySubscriptionId: string,
  ): Promise<string | null>;
  findBarbershopIdByCheckout(checkoutId: string): Promise<string | null>;
  /**
   * Claims the trial-ending warning of a barbershop still in trial (door 7):
   * true only for the first caller.
   */
  claimTrialWarning(barbershopId: string, now: Date): Promise<boolean>;
}

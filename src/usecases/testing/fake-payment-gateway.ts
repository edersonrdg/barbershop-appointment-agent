import { PaymentGatewayUnavailableError } from '../../domain/errors/payment-gateway-unavailable.error';
import {
  CardCheckout,
  CardCheckoutRequest,
  GatewaySubscriptionOwner,
  PaymentGateway,
  PixSubscription,
  PixSubscriptionRequest,
} from '../ports/payment-gateway.port';

type Operation =
  | 'createCardCheckout'
  | 'createPixSubscription'
  | 'cancelSubscription'
  | 'findSubscriptionBarbershop';

export class FakePaymentGateway implements PaymentGateway {
  readonly cardCheckouts: CardCheckoutRequest[] = [];
  readonly pixSubscriptions: PixSubscriptionRequest[] = [];
  readonly cancelled: string[] = [];
  readonly lookups: string[] = [];
  /** Pix subscriptions created and not cancelled, in creation order. */
  readonly livePixSubscriptions: string[] = [];
  readonly owners = new Map<string, GatewaySubscriptionOwner>();
  readonly failing = new Set<Operation>();
  /** When set, `createPixSubscription` waits for it before answering. */
  pixHold: Promise<void> | null = null;
  private sequence = 0;

  get calls(): number {
    return (
      this.cardCheckouts.length +
      this.pixSubscriptions.length +
      this.cancelled.length +
      this.lookups.length
    );
  }

  createCardCheckout(request: CardCheckoutRequest): Promise<CardCheckout> {
    this.cardCheckouts.push(request);
    if (this.failing.has('createCardCheckout')) return this.unavailable();
    const id = `chk_${this.next()}`;
    return Promise.resolve({
      checkoutId: id,
      paymentUrl: `https://sandbox.asaas.com/checkoutSession/show?id=${id}`,
    });
  }

  async createPixSubscription(
    request: PixSubscriptionRequest,
  ): Promise<PixSubscription> {
    this.pixSubscriptions.push(request);
    if (this.pixHold) await this.pixHold;
    if (this.failing.has('createPixSubscription')) return this.unavailable();
    const n = this.next();
    const subscriptionId = `sub_${n}`;
    this.livePixSubscriptions.push(subscriptionId);
    return {
      customerId: `cus_${n}`,
      subscriptionId,
      paymentUrl: `https://sandbox.asaas.com/i/pay_${n}`,
    };
  }

  cancelSubscription(subscriptionId: string): Promise<void> {
    this.cancelled.push(subscriptionId);
    if (this.failing.has('cancelSubscription')) return this.unavailable();
    const index = this.livePixSubscriptions.indexOf(subscriptionId);
    if (index !== -1) this.livePixSubscriptions.splice(index, 1);
    return Promise.resolve();
  }

  findSubscriptionBarbershop(
    subscriptionId: string,
  ): Promise<GatewaySubscriptionOwner | null> {
    this.lookups.push(subscriptionId);
    if (this.failing.has('findSubscriptionBarbershop')) {
      return this.unavailable();
    }
    return Promise.resolve(this.owners.get(subscriptionId) ?? null);
  }

  private next(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private unavailable(): Promise<never> {
    return Promise.reject(new PaymentGatewayUnavailableError());
  }
}

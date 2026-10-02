export const PAYMENT_GATEWAY = Symbol('PaymentGateway');

export interface CardCheckoutRequest {
  barbershopId: string;
  priceCents: number;
  /** Local date of the first charge, `YYYY-MM-DD`. */
  firstDueDate: string;
  /** Where the payer goes back to after paying, cancelling or expiring. */
  returnUrl: string;
}

export interface CardCheckout {
  checkoutId: string;
  paymentUrl: string;
}

export interface PixSubscriptionRequest {
  barbershopId: string;
  priceCents: number;
  /** Local date of the first charge, `YYYY-MM-DD`. */
  firstDueDate: string;
  payer: { name: string; email: string; cpfCnpj: string };
}

export interface PixSubscription {
  customerId: string;
  subscriptionId: string;
  /** Invoice of the first charge, where the payer finds the Pix QR code. */
  paymentUrl: string;
}

/** What the gateway knows about who a subscription belongs to (door 6). */
export interface GatewaySubscriptionOwner {
  /** Our barbershop id, when the subscription carries it as a reference. */
  barbershopId: string | null;
  /** The checkout that created the subscription, if any. */
  checkoutId: string | null;
}

// US-20 (door 4): every call throws `PaymentGatewayUnavailableError` when the
// gateway fails or does not answer in time.
export interface PaymentGateway {
  createCardCheckout(request: CardCheckoutRequest): Promise<CardCheckout>;
  createPixSubscription(
    request: PixSubscriptionRequest,
  ): Promise<PixSubscription>;
  /** Stops future charges. A subscription the gateway no longer has counts as cancelled. */
  cancelSubscription(subscriptionId: string): Promise<void>;
  /** Null when the gateway does not know the subscription. */
  findSubscriptionBarbershop(
    subscriptionId: string,
  ): Promise<GatewaySubscriptionOwner | null>;
}

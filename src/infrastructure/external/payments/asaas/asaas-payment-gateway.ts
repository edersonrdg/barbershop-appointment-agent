import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { PaymentGatewayUnavailableError } from '../../../../domain/errors/payment-gateway-unavailable.error';
import {
  CardCheckout,
  CardCheckoutRequest,
  GatewaySubscriptionOwner,
  PaymentGateway,
  PixSubscription,
  PixSubscriptionRequest,
} from '../../../../usecases/ports/payment-gateway.port';

export interface AsaasConfig {
  /** Base of the v3 API, e.g. `https://api-sandbox.asaas.com/v3`. */
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

type Operation =
  | 'createCardCheckout'
  | 'createPixSubscription'
  | 'cancelSubscription'
  | 'findSubscriptionBarbershop';

interface AsaasResponse {
  status: number;
  body: unknown;
}

const ITEM_NAME = 'Assinatura mensal';
// The Checkout requires an image per item; a transparent 1x1 PNG.
const ITEM_IMAGE =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// Assumption of the plan: a stale link must not be paid after the Owner
// subscribed some other way.
const CHECKOUT_MINUTES_TO_EXPIRE = 60;

const idSchema = z.object({ id: z.string().min(1) });
const checkoutSchema = z.object({
  id: z.string().min(1),
  link: z.string().url(),
});
const paymentsSchema = z.object({
  data: z.array(z.object({ invoiceUrl: z.string().url() })).min(1),
});
const subscriptionSchema = z.object({
  externalReference: z.string().nullish(),
  checkoutSession: z.string().nullish(),
});
const barbershopIdSchema = z.uuid();

// US-20 (door 4): Asaas API v3. Every failure becomes
// `PaymentGatewayUnavailableError`; the body of a call is never logged, since
// it carries the payer's document (LGPD).
export class AsaasPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(AsaasPaymentGateway.name);

  constructor(
    private readonly config: AsaasConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async createCardCheckout(
    request: CardCheckoutRequest,
  ): Promise<CardCheckout> {
    const operation = 'createCardCheckout';
    const response = await this.call(operation, 'POST', '/checkouts', {
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: CHECKOUT_MINUTES_TO_EXPIRE,
      callback: {
        successUrl: request.returnUrl,
        cancelUrl: request.returnUrl,
        expiredUrl: request.returnUrl,
      },
      items: [
        {
          name: ITEM_NAME,
          quantity: 1,
          value: toReais(request.priceCents),
          imageBase64: ITEM_IMAGE,
        },
      ],
      subscription: { cycle: 'MONTHLY', nextDueDate: request.firstDueDate },
      externalReference: request.barbershopId,
    });
    const checkout = this.parse(operation, response, checkoutSchema);
    return { checkoutId: checkout.id, paymentUrl: checkout.link };
  }

  async createPixSubscription(
    request: PixSubscriptionRequest,
  ): Promise<PixSubscription> {
    const operation = 'createPixSubscription';
    const customer = this.parse(
      operation,
      await this.call(operation, 'POST', '/customers', {
        name: request.payer.name,
        cpfCnpj: request.payer.cpfCnpj,
        email: request.payer.email,
        externalReference: request.barbershopId,
      }),
      idSchema,
    );
    const subscription = this.parse(
      operation,
      await this.call(operation, 'POST', '/subscriptions', {
        customer: customer.id,
        billingType: 'PIX',
        cycle: 'MONTHLY',
        value: toReais(request.priceCents),
        nextDueDate: request.firstDueDate,
        description: ITEM_NAME,
        externalReference: request.barbershopId,
      }),
      idSchema,
    );
    try {
      const payments = this.parse(
        operation,
        await this.call(
          operation,
          'GET',
          `/subscriptions/${subscription.id}/payments`,
        ),
        paymentsSchema,
      );
      return {
        customerId: customer.id,
        subscriptionId: subscription.id,
        paymentUrl: payments.data[0].invoiceUrl,
      };
    } catch (error) {
      // Without the invoice the Owner cannot pay, and a subscription we do not
      // record would still issue invoices every month.
      await this.cancelSubscription(subscription.id).catch(() => undefined);
      throw error;
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const operation = 'cancelSubscription';
    const response = await this.call(
      operation,
      'DELETE',
      `/subscriptions/${subscriptionId}`,
    );
    if (response.status === 404) return;
    this.assertOk(operation, response);
  }

  async findSubscriptionBarbershop(
    subscriptionId: string,
  ): Promise<GatewaySubscriptionOwner | null> {
    const operation = 'findSubscriptionBarbershop';
    const response = await this.call(
      operation,
      'GET',
      `/subscriptions/${subscriptionId}`,
    );
    if (response.status === 404) return null;
    const subscription = this.parse(operation, response, subscriptionSchema);
    const reference = barbershopIdSchema.safeParse(
      subscription.externalReference,
    );
    return {
      barbershopId: reference.success ? reference.data : null,
      checkoutId: subscription.checkoutSession ?? null,
    };
  }

  private async call(
    operation: Operation,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<AsaasResponse> {
    const startedAt = Date.now();
    try {
      const response = await this.fetchFn(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          access_token: this.config.apiKey,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      const text = await response.text();
      this.logger.log(
        {
          operation,
          method,
          durationMs: Date.now() - startedAt,
          status: response.status,
        },
        'Asaas call finished.',
      );
      return { status: response.status, body: parseJson(text) };
    } catch (error) {
      this.logger.warn(
        {
          operation,
          method,
          durationMs: Date.now() - startedAt,
          err: { name: (error as { name?: string }).name },
        },
        'Asaas call failed.',
      );
      throw new PaymentGatewayUnavailableError();
    }
  }

  private assertOk(operation: Operation, response: AsaasResponse): void {
    if (response.status >= 200 && response.status < 300) return;
    throw this.failure(operation, response.status);
  }

  private parse<T>(
    operation: Operation,
    response: AsaasResponse,
    schema: z.ZodType<T>,
  ): T {
    this.assertOk(operation, response);
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) throw this.failure(operation, response.status);
    return parsed.data;
  }

  private failure(
    operation: Operation,
    status: number,
  ): PaymentGatewayUnavailableError {
    this.logger.warn({ operation, status }, 'Asaas answered with an error.');
    return new PaymentGatewayUnavailableError();
  }
}

// The Asaas API takes amounts in reais; the domain keeps cents (CLAUDE.md).
function toReais(cents: number): number {
  return cents / 100;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

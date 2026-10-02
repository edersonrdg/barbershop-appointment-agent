import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { EmailSender } from '../ports/email-sender.port';
import { PaymentGateway } from '../ports/payment-gateway.port';
import {
  PaymentEventGroup,
  PaymentMetrics,
} from '../ports/payment-metrics.port';
import { SubscriptionRepository } from '../ports/subscription.repository.port';
import { UserRepository } from '../ports/user.repository.port';

export const PAYMENT_FAILED_EMAIL_SUBJECT =
  'Não conseguimos cobrar sua assinatura';

/** A gateway notification, already translated by its adapter. */
export interface PaymentEvent {
  gateway: string;
  eventId: string;
  kind: PaymentEventGroup;
  gatewaySubscriptionId: string | null;
  /** Due date of the charge, `YYYY-MM-DD`. */
  dueDate: string | null;
  invoiceUrl: string | null;
}

export type PaymentFailureEmail =
  | { outcome: 'none' }
  | { outcome: 'sent' }
  | { outcome: 'failed'; error: unknown };

export interface ApplyPaymentEventResult {
  outcome: 'applied' | 'duplicate' | 'ignored';
  barbershopId: string | null;
  email: PaymentFailureEmail;
}

type Applied = 'applied' | 'ignored' | 'failed';

const NO_EMAIL: PaymentFailureEmail = { outcome: 'none' };

// US-20 (CA-20.1, CA-20.3, RF-42): the gateway is the only source of a paid or
// failed charge. Each event applies once (door 2), and the tenant comes from
// the subscription ids we stored or the gateway's own record (door 6).
export class ApplyPaymentEventUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly gateway: PaymentGateway,
    private readonly barbershops: BarbershopRepository,
    private readonly users: UserRepository,
    private readonly emailSender: EmailSender,
    private readonly metrics: PaymentMetrics,
    private readonly clock: Clock,
  ) {}

  async execute(event: PaymentEvent): Promise<ApplyPaymentEventResult> {
    try {
      const result = await this.apply(event);
      this.metrics.webhookEvent(event.kind, result.outcome);
      return result;
    } catch (error) {
      this.metrics.webhookEvent(event.kind, 'failed');
      throw error;
    }
  }

  private async apply(event: PaymentEvent): Promise<ApplyPaymentEventResult> {
    const { gatewaySubscriptionId, dueDate } = event;
    if (event.kind === 'other' || !gatewaySubscriptionId || !dueDate) {
      return ignored(null);
    }
    const key = { gateway: event.gateway, eventId: event.eventId };
    if (await this.subscriptions.hasEvent(key)) {
      return { outcome: 'duplicate', barbershopId: null, email: NO_EMAIL };
    }
    const barbershopId = await this.findBarbershop(gatewaySubscriptionId);
    if (!barbershopId) return ignored(null);

    const now = this.clock.now();
    const recorded = await this.subscriptions.recordEvent<Applied>(
      key,
      barbershopId,
      (subscription) => {
        subscription.linkGatewaySubscription(gatewaySubscriptionId);
        if (event.kind === 'payment_confirmed') {
          subscription.confirmPayment(dueDate);
          return Promise.resolve({ save: true, result: 'applied' });
        }
        const outcome = subscription.failPayment({
          dueDate,
          invoiceUrl: event.invoiceUrl ?? '',
          now,
        });
        return Promise.resolve(
          outcome === 'failed'
            ? { save: true, result: 'failed' }
            : { save: false, result: 'ignored' },
        );
      },
    );
    if (recorded.duplicate) {
      return { outcome: 'duplicate', barbershopId, email: NO_EMAIL };
    }
    if (recorded.result === 'ignored') return ignored(barbershopId);
    if (recorded.result === 'applied') {
      return { outcome: 'applied', barbershopId, email: NO_EMAIL };
    }
    // AC 27: the e-mail goes after the commit, so a redelivered event never
    // sends it twice; a failed e-mail keeps the barbershop past due.
    return {
      outcome: 'applied',
      barbershopId,
      email: await this.emailOwners(barbershopId, event.invoiceUrl ?? ''),
    };
  }

  private async findBarbershop(
    gatewaySubscriptionId: string,
  ): Promise<string | null> {
    const linked =
      await this.subscriptions.findBarbershopIdByGatewaySubscription(
        gatewaySubscriptionId,
      );
    if (linked) return linked;
    // AC 10: a card checkout creates its subscription at the gateway, so its id
    // reaches us first in a payment event.
    const owner = await this.gateway.findSubscriptionBarbershop(
      gatewaySubscriptionId,
    );
    if (owner?.barbershopId) {
      const known = await this.subscriptions.findByBarbershopId(
        owner.barbershopId,
      );
      if (known) return owner.barbershopId;
    }
    if (owner?.checkoutId) {
      return this.subscriptions.findBarbershopIdByCheckout(owner.checkoutId);
    }
    return null;
  }

  private async emailOwners(
    barbershopId: string,
    invoiceUrl: string,
  ): Promise<PaymentFailureEmail> {
    try {
      const barbershop = await this.barbershops.findById(barbershopId);
      if (!barbershop) return NO_EMAIL;
      const owners = (await this.users.listByBarbershop(barbershopId)).filter(
        (user) => user.role === 'owner',
      );
      const results = await Promise.allSettled(
        owners.map((owner) =>
          this.emailSender.send({
            to: owner.email,
            subject: PAYMENT_FAILED_EMAIL_SUBJECT,
            text: `Olá, ${owner.name}! Não conseguimos cobrar a assinatura da ${barbershop.name}. Para continuar usando, faça o pagamento por este link: ${invoiceUrl}`,
          }),
        ),
      );
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      return failure
        ? { outcome: 'failed', error: failure.reason }
        : { outcome: 'sent' };
    } catch (error) {
      return { outcome: 'failed', error };
    }
  }
}

function ignored(barbershopId: string | null): ApplyPaymentEventResult {
  return { outcome: 'ignored', barbershopId, email: NO_EMAIL };
}

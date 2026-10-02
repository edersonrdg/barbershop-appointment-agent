import { BarbershopSubscription } from '../../domain/entities/barbershop-subscription';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { SubscriptionAlreadyExistsError } from '../../domain/errors/subscription-already-exists.error';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { CpfCnpj } from '../../domain/value-objects/cpf-cnpj';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { PaymentGateway } from '../ports/payment-gateway.port';
import { SubscriptionRepository } from '../ports/subscription.repository.port';
import { UserRepository } from '../ports/user.repository.port';

export const SUBSCRIPTION_PATH = '/assinatura';

export type StartSubscriptionCheckoutInput = {
  barbershopId: string;
  userId: string;
} & ({ method: 'credit_card' } | { method: 'pix'; cpfCnpj: string });

export interface StartSubscriptionCheckoutResult {
  paymentUrl: string;
}

export interface SubscriptionCheckoutConfig {
  priceCents: number;
  appWebUrl: string;
}

// US-20 (CA-20.1, RF-41): the Owner pays on the gateway's page; the barbershop
// only becomes active when the gateway confirms the payment (webhook).
export class StartSubscriptionCheckoutUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly barbershops: BarbershopRepository,
    private readonly users: UserRepository,
    private readonly gateway: PaymentGateway,
    private readonly clock: Clock,
    private readonly config: SubscriptionCheckoutConfig,
  ) {}

  async execute(
    input: StartSubscriptionCheckoutInput,
  ): Promise<StartSubscriptionCheckoutResult> {
    const [barbershop, owner] = await Promise.all([
      this.barbershops.findById(input.barbershopId),
      this.users.findById(input.barbershopId, input.userId),
    ]);
    if (!barbershop || !owner) {
      throw new InvalidCredentialsError();
    }
    const cpfCnpj =
      input.method === 'pix' ? CpfCnpj.create(input.cpfCnpj).value : null;
    const firstDueDate = BarbershopTimezone.create(
      barbershop.timezone,
    ).localDateOf(this.clock.now());

    // Door 8: the barbershop stays locked while the gateway is called, so two
    // clicks never leave two live subscriptions charging the same Owner.
    return this.subscriptions.withLock(
      input.barbershopId,
      async (subscription) => {
        if (!subscription.canStartCheckout()) {
          throw new SubscriptionAlreadyExistsError();
        }
        await this.cancelUnpaid(subscription);

        if (cpfCnpj === null) {
          const checkout = await this.gateway.createCardCheckout({
            barbershopId: input.barbershopId,
            priceCents: this.config.priceCents,
            firstDueDate,
            returnUrl: `${this.config.appWebUrl}${SUBSCRIPTION_PATH}`,
          });
          subscription.startCardCheckout(checkout.checkoutId);
          return { save: true, result: { paymentUrl: checkout.paymentUrl } };
        }

        const pix = await this.gateway.createPixSubscription({
          barbershopId: input.barbershopId,
          priceCents: this.config.priceCents,
          firstDueDate,
          payer: { name: owner.name, email: owner.email, cpfCnpj },
        });
        subscription.startPixSubscription(pix);
        return { save: true, result: { paymentUrl: pix.paymentUrl } };
      },
    );
  }

  // AC 3: in trial, a recorded gateway subscription is a Pix one never paid;
  // left alive it would keep issuing invoices next to the new one.
  private async cancelUnpaid(
    subscription: BarbershopSubscription,
  ): Promise<void> {
    if (subscription.gatewaySubscriptionId === null) return;
    await this.gateway.cancelSubscription(subscription.gatewaySubscriptionId);
  }
}

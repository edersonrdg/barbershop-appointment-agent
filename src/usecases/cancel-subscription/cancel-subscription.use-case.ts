import { NoActiveSubscriptionError } from '../../domain/errors/no-active-subscription.error';
import { Clock } from '../ports/clock.port';
import { PaymentGateway } from '../ports/payment-gateway.port';
import { SubscriptionRepository } from '../ports/subscription.repository.port';

export interface CancelSubscriptionInput {
  barbershopId: string;
}

export interface CancelSubscriptionResult {
  /** Local date the paid month ends, `YYYY-MM-DD`. */
  cancelsAt: string;
}

// US-20 (CA-20.4): the gateway stops charging now; the barbershop stays active
// until the month already paid ends (what happens then is US-21).
export class CancelSubscriptionUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly gateway: PaymentGateway,
    private readonly clock: Clock,
  ) {}

  execute(input: CancelSubscriptionInput): Promise<CancelSubscriptionResult> {
    return this.subscriptions.withLock(
      input.barbershopId,
      async (subscription) => {
        const gatewaySubscriptionId = subscription.gatewaySubscriptionId;
        if (!subscription.canCancel() || gatewaySubscriptionId === null) {
          throw new NoActiveSubscriptionError();
        }
        await this.gateway.cancelSubscription(gatewaySubscriptionId);
        subscription.requestCancel(this.clock.now());
        return {
          save: true,
          result: { cancelsAt: subscription.cancelsAt ?? '' },
        };
      },
    );
  }
}

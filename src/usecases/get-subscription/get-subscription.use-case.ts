import {
  BarbershopSubscription,
  SuspensionReason,
} from '../../domain/entities/barbershop-subscription';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { Clock } from '../ports/clock.port';
import { SubscriptionRepository } from '../ports/subscription.repository.port';

export interface GetSubscriptionInput {
  barbershopId: string;
}

export interface SubscriptionOverview {
  subscription: BarbershopSubscription;
  /** AC 22: worked out on every read, never stored. */
  trialEndingSoon: boolean;
  priceCents: number;
  /** US-21 (CA-21.2): worked out on every read, never stored. */
  suspensionReason: SuspensionReason | null;
}

export interface SubscriptionOverviewConfig {
  priceCents: number;
  warningDays: number;
  graceDays: number;
}

export class GetSubscriptionUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: Clock,
    private readonly config: SubscriptionOverviewConfig,
  ) {}

  async execute(input: GetSubscriptionInput): Promise<SubscriptionOverview> {
    const subscription = await this.subscriptions.findByBarbershopId(
      input.barbershopId,
    );
    if (!subscription) {
      throw new InvalidCredentialsError();
    }
    const now = this.clock.now();
    return {
      subscription,
      trialEndingSoon: subscription.isTrialEndingSoon(
        now,
        this.config.warningDays,
      ),
      priceCents: this.config.priceCents,
      suspensionReason: subscription.suspensionReason(
        now,
        this.config.graceDays,
      ),
    };
  }
}

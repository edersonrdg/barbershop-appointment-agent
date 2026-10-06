import { SuspensionReason } from '../../domain/entities/barbershop-subscription';
import { Clock } from '../ports/clock.port';
import { SubscriptionRepository } from '../ports/subscription.repository.port';

// US-21 (RF-43, RN-25): the one place the panel guard, the bot and the reads
// ask whether a barbershop is suspended, so they can never disagree.
export class GetSuspensionReasonUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: Clock,
    private readonly graceDays: number,
  ) {}

  /** Null when the barbershop is not suspended or does not exist. */
  async execute(barbershopId: string): Promise<SuspensionReason | null> {
    const subscription =
      await this.subscriptions.findByBarbershopId(barbershopId);
    if (!subscription) return null;
    return subscription.suspensionReason(this.clock.now(), this.graceDays);
  }
}

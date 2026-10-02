import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { EmailSender } from '../ports/email-sender.port';
import { SubscriptionRepository } from '../ports/subscription.repository.port';
import { UserRepository } from '../ports/user.repository.port';
import { SUBSCRIPTION_PATH } from '../start-subscription-checkout/start-subscription-checkout.use-case';

export const TRIAL_ENDING_EMAIL_SUBJECT = 'Seu teste gratuito termina em breve';

export interface TrialWarningFailure {
  barbershopId: string;
  error: unknown;
}

export interface SendTrialEndingWarningsResult {
  warned: number;
  failures: TrialWarningFailure[];
}

export interface TrialWarningConfig {
  warningDays: number;
  appWebUrl: string;
}

// US-20 (CA-20.2, RF-42) and AD-009: barbershop by barbershop, the warning is
// claimed before the e-mail and kept when it fails, so it never goes twice.
export class SendTrialEndingWarningsUseCase {
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly users: UserRepository,
    private readonly emailSender: EmailSender,
    private readonly clock: Clock,
    private readonly config: TrialWarningConfig,
  ) {}

  async execute(): Promise<SendTrialEndingWarningsResult> {
    const now = this.clock.now();
    const result: SendTrialEndingWarningsResult = { warned: 0, failures: [] };
    for (const barbershopId of await this.barbershops.listIds()) {
      try {
        if (await this.warn(barbershopId, now)) result.warned += 1;
      } catch (error) {
        result.failures.push({ barbershopId, error });
      }
    }
    return result;
  }

  private async warn(barbershopId: string, now: Date): Promise<boolean> {
    const subscription =
      await this.subscriptions.findByBarbershopId(barbershopId);
    if (!subscription?.isTrialEndingSoon(now, this.config.warningDays)) {
      return false;
    }
    if (!(await this.subscriptions.claimTrialWarning(barbershopId, now))) {
      return false;
    }
    const barbershop = await this.barbershops.findById(barbershopId);
    if (!barbershop) return false;
    const endsOn = formatDate(
      BarbershopTimezone.create(barbershop.timezone).localDateOf(
        subscription.trialEndsAt,
      ),
    );
    const owners = (await this.users.listByBarbershop(barbershopId)).filter(
      (user) => user.role === 'owner',
    );
    const results = await Promise.allSettled(
      owners.map((owner) =>
        this.emailSender.send({
          to: owner.email,
          subject: TRIAL_ENDING_EMAIL_SUBJECT,
          text: `Olá, ${owner.name}! O teste gratuito da ${barbershop.name} termina em ${endsOn}. Para continuar usando, assine em ${this.config.appWebUrl}${SUBSCRIPTION_PATH}.`,
        }),
      ),
    );
    const failure = results.find(
      (item): item is PromiseRejectedResult => item.status === 'rejected',
    );
    if (failure) throw failure.reason;
    return true;
  }
}

// `YYYY-MM-DD` to `dd/MM/yyyy`.
function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-');
  return `${day}/${month}/${year}`;
}

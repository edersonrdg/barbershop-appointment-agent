const MS_PER_DAY = 24 * 60 * 60 * 1000;

// RN-24: todo teste gratuito dura exatamente 14 dias.
export const TRIAL_DURATION_DAYS = 14;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export type SubscriptionStatus = 'trialing';

export interface BarbershopProps {
  id: string;
  name: string;
  timezone: string;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date;
  createdAt: Date;
}

export class Barbershop {
  private constructor(private readonly props: BarbershopProps) {}

  static startTrial({
    id,
    name,
    now,
  }: {
    id: string;
    name: string;
    now: Date;
  }): Barbershop {
    const trialEndsAt = new Date(
      now.getTime() + TRIAL_DURATION_DAYS * MS_PER_DAY,
    );
    return new Barbershop({
      id,
      name,
      timezone: DEFAULT_TIMEZONE,
      subscriptionStatus: 'trialing',
      trialEndsAt,
      createdAt: now,
    });
  }

  static restore(props: BarbershopProps): Barbershop {
    return new Barbershop(props);
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get timezone(): string {
    return this.props.timezone;
  }

  get subscriptionStatus(): SubscriptionStatus {
    return this.props.subscriptionStatus;
  }

  get trialEndsAt(): Date {
    return this.props.trialEndsAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}

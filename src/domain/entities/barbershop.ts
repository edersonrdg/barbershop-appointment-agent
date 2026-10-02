import { BarbershopTimezone } from '../value-objects/barbershop-timezone';
import { WeeklyOpeningHours } from '../value-objects/weekly-opening-hours';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// RN-24: todo teste gratuito dura exatamente 14 dias.
export const TRIAL_DURATION_DAYS = 14;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

// US-20: a cancelled subscription is still `active` until the paid month ends.
export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface BarbershopProps {
  id: string;
  name: string;
  address: string | null;
  timezone: BarbershopTimezone;
  openingHours: WeeklyOpeningHours;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date;
  createdAt: Date;
}

export interface UtcPeriod {
  start: Date;
  end: Date;
}

export class Barbershop {
  private constructor(private props: BarbershopProps) {}

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
      address: null,
      timezone: BarbershopTimezone.create(DEFAULT_TIMEZONE),
      openingHours: WeeklyOpeningHours.allClosed(),
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

  get address(): string | null {
    return this.props.address;
  }

  get timezone(): string {
    return this.props.timezone.value;
  }

  get openingHours(): WeeklyOpeningHours {
    return this.props.openingHours;
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

  updateSettings({
    name,
    address,
    timezone,
    openingHours,
  }: {
    name: string;
    address: string;
    timezone: BarbershopTimezone;
    openingHours: WeeklyOpeningHours;
  }): void {
    this.props = { ...this.props, name, address, timezone, openingHours };
  }

  // CA-03.3: os horários são hora local de parede; o instante UTC depende do
  // fuso atual da barbearia e da própria data.
  openIntervalsOn(localDate: string): UtcPeriod[] {
    const { timezone, openingHours } = this.props;
    const day = openingHours.forDay(timezone.weekdayOf(localDate));
    if (!day) return [];
    return day.openPeriods().map((period) => ({
      start: timezone.toUtc(localDate, period.start),
      end: timezone.toUtc(localDate, period.end),
    }));
  }
}

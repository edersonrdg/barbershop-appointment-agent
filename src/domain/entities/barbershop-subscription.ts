import { BarbershopTimezone } from '../value-objects/barbershop-timezone';
import { addCalendarMonth } from '../value-objects/calendar-date';
import type { SubscriptionStatus } from './barbershop';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const PAYMENT_METHODS = ['credit_card', 'pix'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentFailureOutcome = 'failed' | 'ignored';

export const SUSPENSION_REASONS = [
  'trial_ended',
  'payment_overdue',
  'subscription_ended',
] as const;
export type SuspensionReason = (typeof SUSPENSION_REASONS)[number];

export interface BarbershopSubscriptionProps {
  barbershopId: string;
  /** The barbershop's, which decides the local day a paid period ends on. */
  timezone: BarbershopTimezone;
  status: SubscriptionStatus;
  trialEndsAt: Date;
  paymentMethod: PaymentMethod | null;
  gatewayCustomerId: string | null;
  gatewaySubscriptionId: string | null;
  gatewayCheckoutId: string | null;
  /** Local calendar date, `YYYY-MM-DD`, the last confirmed payment covers. */
  paidUntil: string | null;
  cancelRequestedAt: Date | null;
  paymentFailedAt: Date | null;
  paymentIssueUrl: string | null;
}

// US-20: the paid link of a barbershop with the payment gateway. The status
// lives on the barbershop; the rest exists from the first checkout on.
export class BarbershopSubscription {
  private constructor(private props: BarbershopSubscriptionProps) {}

  static restore(props: BarbershopSubscriptionProps): BarbershopSubscription {
    return new BarbershopSubscription(props);
  }

  get barbershopId(): string {
    return this.props.barbershopId;
  }

  get timezone(): BarbershopTimezone {
    return this.props.timezone;
  }

  get status(): SubscriptionStatus {
    return this.props.status;
  }

  get trialEndsAt(): Date {
    return this.props.trialEndsAt;
  }

  get paymentMethod(): PaymentMethod | null {
    return this.props.paymentMethod;
  }

  get gatewayCustomerId(): string | null {
    return this.props.gatewayCustomerId;
  }

  get gatewaySubscriptionId(): string | null {
    return this.props.gatewaySubscriptionId;
  }

  get gatewayCheckoutId(): string | null {
    return this.props.gatewayCheckoutId;
  }

  get paidUntil(): string | null {
    return this.props.paidUntil;
  }

  get cancelRequestedAt(): Date | null {
    return this.props.cancelRequestedAt;
  }

  get paymentFailedAt(): Date | null {
    return this.props.paymentFailedAt;
  }

  get paymentIssueUrl(): string | null {
    return this.props.paymentIssueUrl;
  }

  // AC 16 and AC 29: the gateway charges again on the day the paid month ends,
  // unless the Owner cancelled.
  get nextChargeDate(): string | null {
    if (this.props.status !== 'active' || this.props.cancelRequestedAt) {
      return null;
    }
    return this.props.paidUntil;
  }

  // CA-20.4: a cancelled subscription stays active until the paid month ends.
  get cancelsAt(): string | null {
    return this.props.cancelRequestedAt ? this.props.paidUntil : null;
  }

  // US-20 AC 7: a barbershop still in trial starts paying, and a past-due one
  // pays through the link of the charge that failed. US-21 AC 22: so does one
  // whose cancelled subscription ended, or it could never come back.
  canStartCheckout(now: Date): boolean {
    return this.props.status === 'trialing' || this.hasEnded(now);
  }

  // US-21 (RN-25): worked out on every read from what the gateway told us, so
  // a confirmed payment lifts the suspension on the very next request.
  suspensionReason(now: Date, graceDays: number): SuspensionReason | null {
    const { status, trialEndsAt, paymentFailedAt } = this.props;
    if (status === 'trialing') {
      return now.getTime() >= trialEndsAt.getTime() ? 'trial_ended' : null;
    }
    if (status === 'past_due') {
      if (!paymentFailedAt) return null;
      const graceEnds = paymentFailedAt.getTime() + graceDays * MS_PER_DAY;
      return now.getTime() >= graceEnds ? 'payment_overdue' : null;
    }
    return this.hasEnded(now) ? 'subscription_ended' : null;
  }

  // `cancelsAt` is the last paid day, in the barbershop's own calendar.
  private hasEnded(now: Date): boolean {
    const { status, cancelRequestedAt, paidUntil, timezone } = this.props;
    if (status !== 'active' || !cancelRequestedAt || !paidUntil) return false;
    return timezone.localDateOf(now) > paidUntil;
  }

  isTrialEndingSoon(now: Date, warningDays: number): boolean {
    if (this.props.status !== 'trialing') return false;
    const left = this.props.trialEndsAt.getTime() - now.getTime();
    return left > 0 && left <= warningDays * MS_PER_DAY;
  }

  startCardCheckout(checkoutId: string): void {
    this.props = {
      ...this.props,
      paymentMethod: 'credit_card',
      gatewayCheckoutId: checkoutId,
      gatewayCustomerId: null,
      gatewaySubscriptionId: null,
    };
  }

  startPixSubscription({
    customerId,
    subscriptionId,
  }: {
    customerId: string;
    subscriptionId: string;
  }): void {
    this.props = {
      ...this.props,
      paymentMethod: 'pix',
      gatewayCustomerId: customerId,
      gatewaySubscriptionId: subscriptionId,
      gatewayCheckoutId: null,
    };
  }

  /** The subscription the card checkout created, known only from its payment. */
  linkGatewaySubscription(subscriptionId: string): void {
    if (this.props.gatewaySubscriptionId) return;
    this.props = { ...this.props, gatewaySubscriptionId: subscriptionId };
  }

  // AC 9 and AC 26: a payment covers one calendar month from its due date. The
  // gateway can confirm the same charge twice (confirmed, then received) or
  // deliver an older one late, so the paid period never shrinks. US-21 AC 23
  // and AC 25: only a charge due after the cancelled period pays a new
  // subscription, so only that one drops the old cancellation.
  confirmPayment(dueDate: string): void {
    const covered = addCalendarMonth(dueDate);
    const previous = this.props.paidUntil;
    const paidUntil = previous && previous > covered ? previous : covered;
    const startsNewPeriod = previous === null || dueDate > previous;
    this.props = {
      ...this.props,
      status: 'active',
      paidUntil,
      cancelRequestedAt: startsNewPeriod ? null : this.props.cancelRequestedAt,
      paymentFailedAt: null,
      paymentIssueUrl: null,
    };
  }

  // AC 23 to AC 25: only a charge of a month not yet paid fails an active
  // subscription; a trial has nothing to fail, and a past-due one keeps the
  // moment of its first failure (US-21 counts the tolerance from it).
  failPayment({
    dueDate,
    invoiceUrl,
    now,
  }: {
    dueDate: string;
    invoiceUrl: string;
    now: Date;
  }): PaymentFailureOutcome {
    if (this.props.status !== 'active') return 'ignored';
    if (this.props.paidUntil && dueDate < this.props.paidUntil) {
      return 'ignored';
    }
    this.props = {
      ...this.props,
      status: 'past_due',
      paymentFailedAt: now,
      paymentIssueUrl: invoiceUrl,
    };
    return 'failed';
  }

  canCancel(): boolean {
    return (
      this.props.status === 'active' &&
      this.props.cancelRequestedAt === null &&
      this.props.gatewaySubscriptionId !== null
    );
  }

  requestCancel(now: Date): void {
    this.props = { ...this.props, cancelRequestedAt: now };
  }
}

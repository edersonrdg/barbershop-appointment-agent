import { BarbershopTimezone } from '../value-objects/barbershop-timezone';
import { addCalendarDays } from '../value-objects/calendar-date';
import {
  DayPeriod,
  dayPeriodEnd,
  dayPeriodOf,
} from '../value-objects/day-period';
import { TimeOfDay } from '../value-objects/time-of-day';

export interface WaitlistEntryProps {
  id: string;
  barbershopId: string;
  clientId: string;
  /** In the order the client asked for them. */
  serviceIds: readonly string[];
  /** `null` means any barber (RF-21). */
  barberId: string | null;
  /** Local dates of the barbershop, `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
  /** `null` means the whole day. */
  period: DayPeriod | null;
  createdAt: Date;
}

// US-24: a client waiting for a slot of the desired period (RF-21).
export class WaitlistEntry {
  private constructor(private readonly props: WaitlistEntryProps) {}

  static create(props: WaitlistEntryProps): WaitlistEntry {
    return new WaitlistEntry({ ...props, serviceIds: [...props.serviceIds] });
  }

  get id(): string {
    return this.props.id;
  }

  get barbershopId(): string {
    return this.props.barbershopId;
  }

  get clientId(): string {
    return this.props.clientId;
  }

  get serviceIds(): readonly string[] {
    return this.props.serviceIds;
  }

  get barberId(): string | null {
    return this.props.barberId;
  }

  get startsOn(): string {
    return this.props.startsOn;
  }

  get endsOn(): string {
    return this.props.endsOn;
  }

  get period(): DayPeriod | null {
    return this.props.period;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  // RN-17: the entry lasts until the end of the desired period on its last day.
  endsAt(timezone: BarbershopTimezone): Date {
    const end = dayPeriodEnd(this.props.period);
    if (end !== null) {
      return timezone.toUtc(this.props.endsOn, TimeOfDay.create(end));
    }
    return timezone.toUtc(
      addCalendarDays(this.props.endsOn, 1),
      TimeOfDay.create('00:00'),
    );
  }

  /** Whether `startsAt` falls within the desired dates and period. */
  covers(timezone: BarbershopTimezone, startsAt: Date): boolean {
    const date = timezone.localDateOf(startsAt);
    if (date < this.props.startsOn || date > this.props.endsOn) return false;
    if (this.props.period === null) return true;
    const minutes = TimeOfDay.create(timezone.localTimeOf(startsAt)).minutes;
    return dayPeriodOf(minutes) === this.props.period;
  }
}

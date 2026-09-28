import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';

@Entity({ name: 'barbershop_booking_rules' })
@Check(
  'barbershop_booking_rules_minimum_advance_check',
  '"minimum_advance_minutes" BETWEEN 0 AND 10080 AND "minimum_advance_minutes" % 5 = 0',
)
@Check(
  'barbershop_booking_rules_cancellation_deadline_check',
  '"cancellation_deadline_minutes" BETWEEN 0 AND 10080 AND "cancellation_deadline_minutes" % 5 = 0',
)
@Check(
  'barbershop_booking_rules_no_show_limit_check',
  '"no_show_limit" BETWEEN 1 AND 10',
)
@Check(
  'barbershop_booking_rules_waitlist_offer_check',
  '"waitlist_offer_minutes" BETWEEN 5 AND 120',
)
@Check(
  'barbershop_booking_rules_return_reminder_check',
  '"return_reminder_days" BETWEEN 7 AND 365',
)
export class BarbershopBookingRulesEntity {
  @ForeignKey(() => BarbershopEntity)
  @PrimaryColumn({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ name: 'minimum_advance_minutes', type: 'integer' })
  minimumAdvanceMinutes!: number;

  @Column({ name: 'cancellation_deadline_minutes', type: 'integer' })
  cancellationDeadlineMinutes!: number;

  @Column({ name: 'no_show_limit', type: 'integer' })
  noShowLimit!: number;

  @Column({ name: 'waitlist_offer_minutes', type: 'integer' })
  waitlistOfferMinutes!: number;

  @Column({ name: 'return_reminder_days', type: 'integer' })
  returnReminderDays!: number;
}

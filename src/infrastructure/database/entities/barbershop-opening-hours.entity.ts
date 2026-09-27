import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';

@Entity({ name: 'barbershop_opening_hours' })
@Check('barbershop_opening_hours_weekday_check', '"weekday" BETWEEN 1 AND 7')
@Check(
  'barbershop_opening_hours_closes_after_opens_check',
  '"closes_at" > "opens_at"',
)
@Check(
  'barbershop_opening_hours_break_within_hours_check',
  '("break_starts_at" IS NULL AND "break_ends_at" IS NULL) OR ("break_starts_at" IS NOT NULL AND "break_ends_at" IS NOT NULL AND "opens_at" < "break_starts_at" AND "break_starts_at" < "break_ends_at" AND "break_ends_at" < "closes_at")',
)
export class BarbershopOpeningHoursEntity {
  @ForeignKey(() => BarbershopEntity)
  @PrimaryColumn({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @PrimaryColumn({ type: 'smallint' })
  weekday!: number;

  @Column({ name: 'opens_at', type: 'time' })
  opensAt!: string;

  @Column({ name: 'closes_at', type: 'time' })
  closesAt!: string;

  @Column({ name: 'break_starts_at', type: 'time', nullable: true })
  breakStartsAt!: string | null;

  @Column({ name: 'break_ends_at', type: 'time', nullable: true })
  breakEndsAt!: string | null;
}

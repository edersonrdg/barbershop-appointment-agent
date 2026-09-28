import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { BarberEntity } from './barber.entity';

@Entity({ name: 'barber_working_hours' })
@Check('barber_working_hours_weekday_check', '"weekday" BETWEEN 1 AND 7')
@Check(
  'barber_working_hours_ends_after_starts_check',
  '"ends_at" > "starts_at"',
)
@Check(
  'barber_working_hours_break_within_hours_check',
  '("break_starts_at" IS NULL AND "break_ends_at" IS NULL) OR ("break_starts_at" IS NOT NULL AND "break_ends_at" IS NOT NULL AND "starts_at" < "break_starts_at" AND "break_starts_at" < "break_ends_at" AND "break_ends_at" < "ends_at")',
)
export class BarberWorkingHoursEntity {
  @ForeignKey(() => BarberEntity)
  @PrimaryColumn({ name: 'barber_id', type: 'uuid' })
  barberId!: string;

  @PrimaryColumn({ type: 'smallint' })
  weekday!: number;

  @Column({ name: 'starts_at', type: 'time' })
  startsAt!: string;

  @Column({ name: 'ends_at', type: 'time' })
  endsAt!: string;

  @Column({ name: 'break_starts_at', type: 'time', nullable: true })
  breakStartsAt!: string | null;

  @Column({ name: 'break_ends_at', type: 'time', nullable: true })
  breakEndsAt!: string | null;
}

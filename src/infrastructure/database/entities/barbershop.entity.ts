import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'barbershops' })
// US-20 (door 3): a cancelled subscription is still `active`, so there is no
// `canceled` status; US-21 widens this check with the suspended one.
@Check(
  'barbershops_subscription_status_check',
  `"subscription_status" IN ('trialing', 'active', 'past_due')`,
)
export class BarbershopEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'America/Sao_Paulo' })
  timezone!: string;

  @Column({ name: 'subscription_status', type: 'varchar', length: 20 })
  subscriptionStatus!: string;

  @Column({ name: 'trial_ends_at', type: 'timestamptz' })
  trialEndsAt!: Date;

  // US-20 (door 7): claimed once by the trial-ending warning job.
  @Column({
    name: 'trial_warning_sent_at',
    type: 'timestamptz',
    nullable: true,
  })
  trialWarningSentAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

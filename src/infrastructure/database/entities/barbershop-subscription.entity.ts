import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { PaymentMethod } from '../../../domain/entities/barbershop-subscription';
import { BarbershopEntity } from './barbershop.entity';

// US-20 (door 1): at most one per barbershop, written from the first checkout
// on. The gateway ids are unique across tenants because the webhook finds the
// barbershop through them (door 6).
@Entity({ name: 'barbershop_subscriptions' })
@Check(
  'barbershop_subscriptions_payment_method_check',
  `"payment_method" IN ('credit_card', 'pix')`,
)
@Index(
  'UQ_barbershop_subscriptions_gateway_subscription_id',
  ['gatewaySubscriptionId'],
  { unique: true, where: '"gateway_subscription_id" IS NOT NULL' },
)
@Index(
  'UQ_barbershop_subscriptions_gateway_checkout_id',
  ['gatewayCheckoutId'],
  { unique: true, where: '"gateway_checkout_id" IS NOT NULL' },
)
export class BarbershopSubscriptionEntity {
  @ForeignKey(() => BarbershopEntity, { onDelete: 'CASCADE' })
  @PrimaryColumn({
    name: 'barbershop_id',
    type: 'uuid',
    primaryKeyConstraintName: 'PK_barbershop_subscriptions_barbershop_id',
  })
  barbershopId!: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 20 })
  paymentMethod!: PaymentMethod;

  @Column({
    name: 'gateway_customer_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  gatewayCustomerId!: string | null;

  @Column({
    name: 'gateway_subscription_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  gatewaySubscriptionId!: string | null;

  @Column({
    name: 'gateway_checkout_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  gatewayCheckoutId!: string | null;

  // A local calendar date: the gateway bills by due date, not by instant.
  @Column({ name: 'paid_until', type: 'date', nullable: true })
  paidUntil!: string | null;

  @Column({ name: 'cancel_requested_at', type: 'timestamptz', nullable: true })
  cancelRequestedAt!: Date | null;

  @Column({ name: 'payment_failed_at', type: 'timestamptz', nullable: true })
  paymentFailedAt!: Date | null;

  @Column({
    name: 'payment_issue_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  paymentIssueUrl!: string | null;
}

import { MigrationInterface, QueryRunner } from 'typeorm';

// US-20: the subscription of each barbershop (door 1), the gateway events
// already applied (door 2), the closed set of statuses (door 3) and the
// trial-ending warning claim (door 7). Every barbershop is still `trialing`,
// so the check holds on existing rows; the new tables start empty.

export class AddSubscriptions1790956376701 implements MigrationInterface {
  name = 'AddSubscriptions1790956376701';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "barbershop_subscriptions" ("barbershop_id" uuid NOT NULL, "payment_method" character varying(20) NOT NULL, "gateway_customer_id" character varying(100), "gateway_subscription_id" character varying(100), "gateway_checkout_id" character varying(100), "paid_until" date, "cancel_requested_at" TIMESTAMP WITH TIME ZONE, "payment_failed_at" TIMESTAMP WITH TIME ZONE, "payment_issue_url" character varying(500), CONSTRAINT "barbershop_subscriptions_payment_method_check" CHECK ("payment_method" IN ('credit_card', 'pix')), CONSTRAINT "PK_barbershop_subscriptions_barbershop_id" PRIMARY KEY ("barbershop_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_barbershop_subscriptions_gateway_checkout_id" ON "barbershop_subscriptions"  ("gateway_checkout_id") WHERE "gateway_checkout_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_barbershop_subscriptions_gateway_subscription_id" ON "barbershop_subscriptions"  ("gateway_subscription_id") WHERE "gateway_subscription_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_gateway_events" ("gateway" character varying(20) NOT NULL, "event_id" character varying(100) NOT NULL, "barbershop_id" uuid, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_payment_gateway_events" PRIMARY KEY ("gateway", "event_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbershops" ADD "trial_warning_sent_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_subscription_status_check" CHECK ("subscription_status" IN ('trialing', 'active', 'past_due'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbershop_subscriptions" ADD CONSTRAINT "FK_07dbcf2e43ba422424a893bd711" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_gateway_events" ADD CONSTRAINT "FK_ae4b20809d93245357a09f59b09" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_gateway_events" DROP CONSTRAINT "FK_ae4b20809d93245357a09f59b09"`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbershop_subscriptions" DROP CONSTRAINT "FK_07dbcf2e43ba422424a893bd711"`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbershops" DROP CONSTRAINT "barbershops_subscription_status_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbershops" DROP COLUMN "trial_warning_sent_at"`,
    );
    await queryRunner.query(`DROP TABLE "payment_gateway_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_barbershop_subscriptions_gateway_subscription_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_barbershop_subscriptions_gateway_checkout_id"`,
    );
    await queryRunner.query(`DROP TABLE "barbershop_subscriptions"`);
  }
}

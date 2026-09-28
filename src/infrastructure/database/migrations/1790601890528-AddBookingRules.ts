import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingRules1790601890528 implements MigrationInterface {
  name = 'AddBookingRules1790601890528';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "barbershop_booking_rules" ("barbershop_id" uuid NOT NULL, "minimum_advance_minutes" integer NOT NULL, "cancellation_deadline_minutes" integer NOT NULL, "no_show_limit" integer NOT NULL, "waitlist_offer_minutes" integer NOT NULL, "return_reminder_days" integer NOT NULL, CONSTRAINT "barbershop_booking_rules_return_reminder_check" CHECK ("return_reminder_days" BETWEEN 7 AND 365), CONSTRAINT "barbershop_booking_rules_waitlist_offer_check" CHECK ("waitlist_offer_minutes" BETWEEN 5 AND 120), CONSTRAINT "barbershop_booking_rules_no_show_limit_check" CHECK ("no_show_limit" BETWEEN 1 AND 10), CONSTRAINT "barbershop_booking_rules_cancellation_deadline_check" CHECK ("cancellation_deadline_minutes" BETWEEN 0 AND 10080 AND "cancellation_deadline_minutes" % 5 = 0), CONSTRAINT "barbershop_booking_rules_minimum_advance_check" CHECK ("minimum_advance_minutes" BETWEEN 0 AND 10080 AND "minimum_advance_minutes" % 5 = 0), CONSTRAINT "PK_2ba7eb728b78d704762b46b082f" PRIMARY KEY ("barbershop_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbershop_booking_rules" ADD CONSTRAINT "FK_2ba7eb728b78d704762b46b082f" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    // CA-06.1: barbearias criadas antes desta história recebem os padrões.
    // Valores literais: a migration não acompanha mudanças futuras do domínio.
    await queryRunner.query(
      `INSERT INTO "barbershop_booking_rules" ("barbershop_id", "minimum_advance_minutes", "cancellation_deadline_minutes", "no_show_limit", "waitlist_offer_minutes", "return_reminder_days") SELECT "id", 60, 120, 2, 15, 30 FROM "barbershops"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "barbershop_booking_rules" DROP CONSTRAINT "FK_2ba7eb728b78d704762b46b082f"`,
    );
    await queryRunner.query(`DROP TABLE "barbershop_booking_rules"`);
  }
}

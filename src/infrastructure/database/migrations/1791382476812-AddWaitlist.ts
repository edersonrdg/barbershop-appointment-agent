import { MigrationInterface, QueryRunner } from 'typeorm';

// US-24 (door 1): the waitlist entries with their services and the offers of
// freed slots. The partial unique indexes keep one pending offer per freed slot
// and per entry across concurrent runs (RN-15). The tables start empty.

export class AddWaitlist1791382476812 implements MigrationInterface {
  name = 'AddWaitlist1791382476812';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "waitlist_entries" ("id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "client_id" uuid NOT NULL, "barber_id" uuid, "starts_on" date NOT NULL, "ends_on" date NOT NULL, "period" character varying(10), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "waitlist_entries_id_barbershop_unique" UNIQUE ("id", "barbershop_id"), CONSTRAINT "waitlist_entries_client_unique" UNIQUE ("barbershop_id", "client_id"), CONSTRAINT "waitlist_entries_period_check" CHECK ("period" IN ('morning', 'afternoon', 'evening')), CONSTRAINT "waitlist_entries_dates_check" CHECK ("ends_on" >= "starts_on"), CONSTRAINT "PK_bd0ef66fff81d3be7b7a1568a4d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "waitlist_entries_queue_idx" ON "waitlist_entries"  ("barbershop_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "waitlist_entry_services" ("entry_id" uuid NOT NULL, "position" smallint NOT NULL, "service_id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, CONSTRAINT "PK_e5a54c1fe0dbd246c1880bf40b5" PRIMARY KEY ("entry_id", "position"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "waitlist_offers" ("id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "entry_id" uuid NOT NULL, "appointment_id" uuid NOT NULL, "barber_id" uuid NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying(10) NOT NULL, CONSTRAINT "waitlist_offers_entry_appointment_unique" UNIQUE ("entry_id", "appointment_id"), CONSTRAINT "waitlist_offers_status_check" CHECK ("status" IN ('pending', 'accepted', 'declined', 'expired')), CONSTRAINT "PK_3d58236088bccae962fc10e058e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "waitlist_offers_pending_entry_unique" ON "waitlist_offers"  ("entry_id") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "waitlist_offers_pending_appointment_unique" ON "waitlist_offers"  ("barbershop_id", "appointment_id") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entries" ADD CONSTRAINT "FK_459a522f63b2c195a0ce1bef250" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_barber_fk" FOREIGN KEY ("barber_id", "barbershop_id") REFERENCES "barbers"("id","barbershop_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_client_fk" FOREIGN KEY ("client_id", "barbershop_id") REFERENCES "clients"("id","barbershop_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entry_services" ADD CONSTRAINT "waitlist_entry_services_service_fk" FOREIGN KEY ("service_id", "barbershop_id") REFERENCES "services"("id","barbershop_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entry_services" ADD CONSTRAINT "waitlist_entry_services_entry_fk" FOREIGN KEY ("entry_id", "barbershop_id") REFERENCES "waitlist_entries"("id","barbershop_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_offers" ADD CONSTRAINT "waitlist_offers_appointment_fk" FOREIGN KEY ("appointment_id", "barbershop_id") REFERENCES "appointments"("id","barbershop_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_offers" ADD CONSTRAINT "waitlist_offers_entry_fk" FOREIGN KEY ("entry_id", "barbershop_id") REFERENCES "waitlist_entries"("id","barbershop_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "waitlist_offers" DROP CONSTRAINT "waitlist_offers_entry_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_offers" DROP CONSTRAINT "waitlist_offers_appointment_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entry_services" DROP CONSTRAINT "waitlist_entry_services_entry_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entry_services" DROP CONSTRAINT "waitlist_entry_services_service_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entries" DROP CONSTRAINT "waitlist_entries_client_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entries" DROP CONSTRAINT "waitlist_entries_barber_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entries" DROP CONSTRAINT "FK_459a522f63b2c195a0ce1bef250"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."waitlist_offers_pending_appointment_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."waitlist_offers_pending_entry_unique"`,
    );
    await queryRunner.query(`DROP TABLE "waitlist_offers"`);
    await queryRunner.query(`DROP TABLE "waitlist_entry_services"`);
    await queryRunner.query(`DROP INDEX "public"."waitlist_entries_queue_idx"`);
    await queryRunner.query(`DROP TABLE "waitlist_entries"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

// US-25 (door 1): the question and the invite are claimed on the client and on
// the attended appointment, and every opt-in change is a new consent row
// (CA-25.5). The new columns start null and the table starts empty.

export class AddReturnReminder1791465704690 implements MigrationInterface {
  name = 'AddReturnReminder1791465704690';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "return_reminder_consents" ("id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "client_id" uuid NOT NULL, "enabled" boolean NOT NULL, "channel" character varying(20) NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "return_reminder_consents_channel_check" CHECK ("channel" IN ('whatsapp')), CONSTRAINT "PK_14b4517eb10bc4f4c9eabb6d866" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "return_reminder_consents_client_idx" ON "return_reminder_consents"  ("barbershop_id", "client_id", "recorded_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ADD "return_reminder_asked_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "return_reminder_sent_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_reminder_consents" ADD CONSTRAINT "return_reminder_consents_client_fk" FOREIGN KEY ("client_id", "barbershop_id") REFERENCES "clients"("id","barbershop_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "return_reminder_consents" DROP CONSTRAINT "return_reminder_consents_client_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "return_reminder_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN "return_reminder_asked_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."return_reminder_consents_client_idx"`,
    );
    await queryRunner.query(`DROP TABLE "return_reminder_consents"`);
  }
}

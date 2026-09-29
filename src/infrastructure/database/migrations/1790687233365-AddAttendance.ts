import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendance1790687233365 implements MigrationInterface {
  name = 'AddAttendance1790687233365';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "appointments_status_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "appointments_status_check" CHECK ("status" IN ('confirmed', 'attended', 'no_show'))`,
    );
    // RN-03 (ATD-04): attended and no-show appointments keep holding the slot.
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "appointments_no_overlap"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist ("barber_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&) WHERE ("status" IN ('confirmed', 'attended', 'no_show'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ADD "no_show_reset_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "appointments_client_no_show_idx" ON "appointments"  ("barbershop_id", "client_id", "starts_at") WHERE "status" = 'no_show'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."appointments_client_no_show_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN "no_show_reset_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "appointments_no_overlap"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist ("barber_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&) WHERE ("status" = 'confirmed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "appointments_status_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "appointments_status_check" CHECK ("status" IN ('confirmed'))`,
    );
  }
}

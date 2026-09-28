import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppointments1790607839456 implements MigrationInterface {
  name = 'AddAppointments1790607839456';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // RN-07: the exclusion constraint compares barber_id (uuid) with = inside a gist index.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await queryRunner.query(
      `CREATE TABLE "appointments" ("id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "barber_id" uuid NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying(20) NOT NULL, "origin" character varying(20) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "appointments_id_barbershop_unique" UNIQUE ("id", "barbershop_id"), CONSTRAINT "appointments_origin_check" CHECK ("origin" IN ('bot', 'manual')), CONSTRAINT "appointments_status_check" CHECK ("status" IN ('confirmed')), CONSTRAINT "appointments_ends_after_starts_check" CHECK ("ends_at" > "starts_at"), CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist ("barber_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&) WHERE ("status" = 'confirmed'), CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "appointment_services" ("appointment_id" uuid NOT NULL, "position" smallint NOT NULL, "service_id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, CONSTRAINT "appointment_services_service_unique" UNIQUE ("appointment_id", "service_id"), CONSTRAINT "PK_0cbd9f84dfb763f536d084445f8" PRIMARY KEY ("appointment_id", "position"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "barber_blocks" ("id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "barber_id" uuid NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "barber_blocks_ends_after_starts_check" CHECK ("ends_at" > "starts_at"), CONSTRAINT "PK_a75b1e336daa22289fa0b3c3f6b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "barber_blocks_barber_range_idx" ON "barber_blocks"  ("barber_id", "starts_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_bd1d67c0acfb3125e5af915f313" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barber_fk" FOREIGN KEY ("barber_id", "barbershop_id") REFERENCES "barbers"("id","barbershop_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_fk" FOREIGN KEY ("service_id", "barbershop_id") REFERENCES "services"("id","barbershop_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_fk" FOREIGN KEY ("appointment_id", "barbershop_id") REFERENCES "appointments"("id","barbershop_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "barber_blocks" ADD CONSTRAINT "barber_blocks_barber_fk" FOREIGN KEY ("barber_id", "barbershop_id") REFERENCES "barbers"("id","barbershop_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "barber_blocks" DROP CONSTRAINT "barber_blocks_barber_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointment_services" DROP CONSTRAINT "appointment_services_appointment_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointment_services" DROP CONSTRAINT "appointment_services_service_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "appointments_barber_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_bd1d67c0acfb3125e5af915f313"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."barber_blocks_barber_range_idx"`,
    );
    await queryRunner.query(`DROP TABLE "barber_blocks"`);
    await queryRunner.query(`DROP TABLE "appointment_services"`);
    await queryRunner.query(`DROP TABLE "appointments"`);
    // btree_gist stays: up only creates it if missing, and dropping it could
    // break objects created outside this migration.
  }
}

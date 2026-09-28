import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBarbers1790565285998 implements MigrationInterface {
  name = 'AddBarbers1790565285998';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "barbers" ("id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "name" character varying(60) NOT NULL, "user_id" uuid, "active" boolean NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "barbers_id_barbershop_unique" UNIQUE ("id", "barbershop_id"), CONSTRAINT "PK_3602c05627856e4cd6d91585d65" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "barbers_user_id_unique" ON "barbers"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "barbers_name_unique" ON "barbers" ("barbershop_id", lower("name"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "barber_services" ("barber_id" uuid NOT NULL, "service_id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "position" smallint NOT NULL, CONSTRAINT "PK_1c13e7755814fe409603c84d985" PRIMARY KEY ("barber_id", "service_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "barber_working_hours" ("barber_id" uuid NOT NULL, "weekday" smallint NOT NULL, "starts_at" TIME NOT NULL, "ends_at" TIME NOT NULL, "break_starts_at" TIME, "break_ends_at" TIME, CONSTRAINT "barber_working_hours_break_within_hours_check" CHECK (("break_starts_at" IS NULL AND "break_ends_at" IS NULL) OR ("break_starts_at" IS NOT NULL AND "break_ends_at" IS NOT NULL AND "starts_at" < "break_starts_at" AND "break_starts_at" < "break_ends_at" AND "break_ends_at" < "ends_at")), CONSTRAINT "barber_working_hours_ends_after_starts_check" CHECK ("ends_at" > "starts_at"), CONSTRAINT "barber_working_hours_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7), CONSTRAINT "PK_d916f5bc97975808ba59cb9a732" PRIMARY KEY ("barber_id", "weekday"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "users_id_barbershop_unique" UNIQUE ("id", "barbershop_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD CONSTRAINT "services_id_barbershop_unique" UNIQUE ("id", "barbershop_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbers" ADD CONSTRAINT "FK_266e70534ac6c92a3fee0701adf" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbers" ADD CONSTRAINT "barbers_user_fk" FOREIGN KEY ("user_id", "barbershop_id") REFERENCES "users"("id","barbershop_id") ON DELETE SET NULL ("user_id") ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "barber_services" ADD CONSTRAINT "barber_services_service_fk" FOREIGN KEY ("service_id", "barbershop_id") REFERENCES "services"("id","barbershop_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "barber_services" ADD CONSTRAINT "barber_services_barber_fk" FOREIGN KEY ("barber_id", "barbershop_id") REFERENCES "barbers"("id","barbershop_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "barber_working_hours" ADD CONSTRAINT "FK_5ec0e2ebf66e3a0f9cfacb6c3ce" FOREIGN KEY ("barber_id") REFERENCES "barbers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "barber_working_hours" DROP CONSTRAINT "FK_5ec0e2ebf66e3a0f9cfacb6c3ce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "barber_services" DROP CONSTRAINT "barber_services_barber_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "barber_services" DROP CONSTRAINT "barber_services_service_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbers" DROP CONSTRAINT "barbers_user_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbers" DROP CONSTRAINT "FK_266e70534ac6c92a3fee0701adf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" DROP CONSTRAINT "services_id_barbershop_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "users_id_barbershop_unique"`,
    );
    await queryRunner.query(`DROP TABLE "barber_working_hours"`);
    await queryRunner.query(`DROP TABLE "barber_services"`);
    await queryRunner.query(`DROP INDEX "public"."barbers_name_unique"`);
    await queryRunner.query(`DROP INDEX "public"."barbers_user_id_unique"`);
    await queryRunner.query(`DROP TABLE "barbers"`);
  }
}

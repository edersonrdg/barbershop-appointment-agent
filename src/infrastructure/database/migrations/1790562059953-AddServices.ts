import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddServices1790562059953 implements MigrationInterface {
  name = 'AddServices1790562059953';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "services" ("id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "name" character varying(60) NOT NULL, "price_cents" integer NOT NULL, "duration_minutes" smallint NOT NULL, "active" boolean NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "services_duration_minutes_check" CHECK ("duration_minutes" BETWEEN 5 AND 480 AND "duration_minutes" % 5 = 0), CONSTRAINT "services_price_cents_check" CHECK ("price_cents" BETWEEN 0 AND 1000000), CONSTRAINT "PK_ba2d347a3168a296416c6c5ccb2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "services_name_unique" ON "services" ("barbershop_id", lower("name"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "service_add_ons" ("service_id" uuid NOT NULL, "add_on_service_id" uuid NOT NULL, "position" smallint NOT NULL, CONSTRAINT "service_add_ons_not_self_check" CHECK ("service_id" <> "add_on_service_id"), CONSTRAINT "PK_e9bb56bbf2ec589f988ef57ee7d" PRIMARY KEY ("service_id", "add_on_service_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD CONSTRAINT "FK_f6320bfc302b0608378e1b51ceb" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_add_ons" ADD CONSTRAINT "FK_8429cc2642fad8924c7f09e9d2d" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_add_ons" ADD CONSTRAINT "FK_fd6bdd07e4d4491ecf7a2f8d395" FOREIGN KEY ("add_on_service_id") REFERENCES "services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "service_add_ons" DROP CONSTRAINT "FK_fd6bdd07e4d4491ecf7a2f8d395"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_add_ons" DROP CONSTRAINT "FK_8429cc2642fad8924c7f09e9d2d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" DROP CONSTRAINT "FK_f6320bfc302b0608378e1b51ceb"`,
    );
    await queryRunner.query(`DROP TABLE "service_add_ons"`);
    await queryRunner.query(`DROP INDEX "services_name_unique"`);
    await queryRunner.query(`DROP TABLE "services"`);
  }
}

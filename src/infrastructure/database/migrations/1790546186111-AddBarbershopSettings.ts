import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBarbershopSettings1790546186111 implements MigrationInterface {
  name = 'AddBarbershopSettings1790546186111';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "barbershop_opening_hours" ("barbershop_id" uuid NOT NULL, "weekday" smallint NOT NULL, "opens_at" TIME NOT NULL, "closes_at" TIME NOT NULL, "break_starts_at" TIME, "break_ends_at" TIME, CONSTRAINT "barbershop_opening_hours_break_within_hours_check" CHECK (("break_starts_at" IS NULL AND "break_ends_at" IS NULL) OR ("break_starts_at" IS NOT NULL AND "break_ends_at" IS NOT NULL AND "opens_at" < "break_starts_at" AND "break_starts_at" < "break_ends_at" AND "break_ends_at" < "closes_at")), CONSTRAINT "barbershop_opening_hours_closes_after_opens_check" CHECK ("closes_at" > "opens_at"), CONSTRAINT "barbershop_opening_hours_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7), CONSTRAINT "PK_ddac85282a3c0a95411d0f43141" PRIMARY KEY ("barbershop_id", "weekday"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbershops" ADD "address" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "barbershop_opening_hours" ADD CONSTRAINT "FK_efa960cc57ad044c3ba58fcfdbc" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "barbershop_opening_hours" DROP CONSTRAINT "FK_efa960cc57ad044c3ba58fcfdbc"`,
    );
    await queryRunner.query(`ALTER TABLE "barbershops" DROP COLUMN "address"`);
    await queryRunner.query(`DROP TABLE "barbershop_opening_hours"`);
  }
}

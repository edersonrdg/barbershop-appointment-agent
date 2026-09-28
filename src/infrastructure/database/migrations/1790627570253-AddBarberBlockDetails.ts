import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBarberBlockDetails1790627570253 implements MigrationInterface {
  name = 'AddBarberBlockDetails1790627570253';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // BLQ-27: the default only backfills the blocks saved before US-09; the
    // application always writes the kind (AD-008).
    await queryRunner.query(
      `ALTER TABLE "barber_blocks" ADD "kind" character varying(16) NOT NULL DEFAULT 'block'`,
    );
    await queryRunner.query(
      `ALTER TABLE "barber_blocks" ALTER COLUMN "kind" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "barber_blocks" ADD "reason" character varying(120)`,
    );
    await queryRunner.query(
      `CREATE INDEX "barber_blocks_barbershop_range_idx" ON "barber_blocks"  ("barbershop_id", "starts_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "barber_blocks" ADD CONSTRAINT "barber_blocks_kind_check" CHECK ("kind" IN ('block', 'day_off'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "barber_blocks" DROP CONSTRAINT "barber_blocks_kind_check"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."barber_blocks_barbershop_range_idx"`,
    );
    await queryRunner.query(`ALTER TABLE "barber_blocks" DROP COLUMN "reason"`);
    await queryRunner.query(`ALTER TABLE "barber_blocks" DROP COLUMN "kind"`);
  }
}

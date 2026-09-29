import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientReturnReminder1790696551657 implements MigrationInterface {
  name = 'AddClientReturnReminder1790696551657';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" ADD "return_reminder_enabled" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN "return_reminder_enabled"`,
    );
  }
}

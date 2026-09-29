import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientPrivacyNotice1790700000000 implements MigrationInterface {
  name = 'AddClientPrivacyNotice1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" ADD "privacy_notice_sent_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN "privacy_notice_sent_at"`,
    );
  }
}

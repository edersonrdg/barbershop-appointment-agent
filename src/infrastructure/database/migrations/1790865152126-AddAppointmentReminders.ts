import { MigrationInterface, QueryRunner } from 'typeorm';

// US-19: when each reminder went out and when the client confirmed (door 1).
// Nullable with no default: existing appointments start without either.
export class AddAppointmentReminders1790865152126 implements MigrationInterface {
  name = 'AddAppointmentReminders1790865152126';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "reminder_24h_sent_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "reminder_1h_sent_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "client_confirmed_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "client_confirmed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "reminder_1h_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "reminder_24h_sent_at"`,
    );
  }
}

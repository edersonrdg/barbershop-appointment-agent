import { MigrationInterface, QueryRunner } from 'typeorm';

// US-18: the cancelled appointment (door 1) and the late cancellation as a
// hand-off reason (RN-09, RN-22, door 3). The exclusion constraint keeps only
// the statuses that hold the slot, so a cancelled appointment frees it.
export class AddAppointmentCancellation1790860672408 implements MigrationInterface {
  name = 'AddAppointmentCancellation1790860672408';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "appointments_status_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "appointments_status_check" CHECK ("status" IN ('confirmed', 'attended', 'no_show', 'cancelled'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" DROP CONSTRAINT "whatsapp_conversations_pause_reason_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_pause_reason_check" CHECK ("pause_reason" IN ('requested', 'not_understood', 'blocked_client', 'late_cancellation'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" DROP CONSTRAINT "whatsapp_conversations_pause_reason_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_pause_reason_check" CHECK ("pause_reason" IN ('requested', 'not_understood', 'blocked_client'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "appointments_status_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "appointments_status_check" CHECK ("status" IN ('confirmed', 'attended', 'no_show'))`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

// US-17: the booking in progress on the conversation (AD-013) and the blocked
// client as a hand-off reason (RN-12, RN-22).
export class AddWhatsAppBookingDraft1790812482602 implements MigrationInterface {
  name = 'AddWhatsAppBookingDraft1790812482602';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" ADD "booking_draft" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" DROP CONSTRAINT "whatsapp_conversations_pause_reason_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_pause_reason_check" CHECK ("pause_reason" IN ('requested', 'not_understood', 'blocked_client'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" DROP CONSTRAINT "whatsapp_conversations_pause_reason_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_pause_reason_check" CHECK ("pause_reason" IN ('requested', 'not_understood'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" DROP COLUMN "booking_draft"`,
    );
  }
}

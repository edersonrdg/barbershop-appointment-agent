import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWhatsAppConversations1790724885201 implements MigrationInterface {
  name = 'CreateWhatsAppConversations1790724885201';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "whatsapp_conversations" ("barbershop_id" uuid NOT NULL, "client_id" uuid NOT NULL, "consecutive_failures" integer NOT NULL DEFAULT '0', "paused_at" TIMESTAMP WITH TIME ZONE, "pause_reason" text, "last_activity_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "whatsapp_conversations_failures_check" CHECK ("consecutive_failures" >= 0), CONSTRAINT "whatsapp_conversations_pause_check" CHECK (("paused_at" IS NULL) = ("pause_reason" IS NULL)), CONSTRAINT "whatsapp_conversations_pause_reason_check" CHECK ("pause_reason" IN ('requested', 'not_understood')), CONSTRAINT "PK_whatsapp_conversations" PRIMARY KEY ("barbershop_id", "client_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "FK_e7df9f2d23f406d435a4f17f6c4" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "FK_6c4f592a4787ff2788438755954" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" DROP CONSTRAINT "FK_6c4f592a4787ff2788438755954"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" DROP CONSTRAINT "FK_e7df9f2d23f406d435a4f17f6c4"`,
    );
    await queryRunner.query(`DROP TABLE "whatsapp_conversations"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWhatsAppInboundMessages1790722602777 implements MigrationInterface {
  name = 'CreateWhatsAppInboundMessages1790722602777';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "whatsapp_inbound_messages" ("barbershop_id" uuid NOT NULL, "message_id" text NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_whatsapp_inbound_messages" PRIMARY KEY ("barbershop_id", "message_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_inbound_messages" ADD CONSTRAINT "FK_5a70576d848f3e133fec3aa2a31" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_inbound_messages" DROP CONSTRAINT "FK_5a70576d848f3e133fec3aa2a31"`,
    );
    await queryRunner.query(`DROP TABLE "whatsapp_inbound_messages"`);
  }
}

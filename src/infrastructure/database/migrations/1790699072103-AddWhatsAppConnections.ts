import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsAppConnections1790699072103 implements MigrationInterface {
  name = 'AddWhatsAppConnections1790699072103';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "whatsapp_connections" ("barbershop_id" uuid NOT NULL, "status" text NOT NULL, "disconnected_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "whatsapp_connections_status_check" CHECK ("status" IN ('disconnected', 'connecting', 'connected')), CONSTRAINT "PK_whatsapp_connections_barbershop_id" PRIMARY KEY ("barbershop_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "FK_c8e3cebf5c2d858ef3e5eece667" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" DROP CONSTRAINT "FK_c8e3cebf5c2d858ef3e5eece667"`,
    );
    await queryRunner.query(`DROP TABLE "whatsapp_connections"`);
  }
}

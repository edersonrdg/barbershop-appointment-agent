import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClients1790624650790 implements MigrationInterface {
  name = 'AddClients1790624650790';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "clients" ("id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "name" character varying(80) NOT NULL, "phone" character varying(20) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "clients_id_barbershop_unique" UNIQUE ("id", "barbershop_id"), CONSTRAINT "clients_barbershop_phone_unique" UNIQUE ("barbershop_id", "phone"), CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "appointments" ADD "client_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "appointments_barbershop_starts_idx" ON "appointments"  ("barbershop_id", "starts_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ADD CONSTRAINT "FK_78f52043ca8b63955b4af1164ae" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_fk" FOREIGN KEY ("client_id", "barbershop_id") REFERENCES "clients"("id","barbershop_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "appointments_client_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT "FK_78f52043ca8b63955b4af1164ae"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."appointments_barbershop_starts_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "client_id"`,
    );
    await queryRunner.query(`DROP TABLE "clients"`);
  }
}

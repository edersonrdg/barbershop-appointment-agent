import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountTables1790529458024 implements MigrationInterface {
  name = 'CreateAccountTables1790529458024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "barbershops" ("id" uuid NOT NULL, "name" character varying(100) NOT NULL, "timezone" character varying(64) NOT NULL DEFAULT 'America/Sao_Paulo', "subscription_status" character varying(20) NOT NULL, "trial_ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_6da853d8fa59f0f97114c30e5b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "email" character varying(254) NOT NULL, "phone" character varying(16) NOT NULL, "password_hash" text NOT NULL, "role" character varying(20) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "users_barbershop_id_idx" ON "users"  ("barbershop_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_email_unique" ON "users"  ("email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL, "user_id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "token_hash" character(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "password_reset_tokens_hash_unique" ON "password_reset_tokens"  ("token_hash") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_bc45716d5ebcb8808e5095f7f3b" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_035dbc98a4cfb0ee5d3c5d6b9f7" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_035dbc98a4cfb0ee5d3c5d6b9f7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_bc45716d5ebcb8808e5095f7f3b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."password_reset_tokens_hash_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."password_reset_tokens_user_id_idx"`,
    );
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."users_email_unique"`);
    await queryRunner.query(`DROP INDEX "public"."users_barbershop_id_idx"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "barbershops"`);
  }
}

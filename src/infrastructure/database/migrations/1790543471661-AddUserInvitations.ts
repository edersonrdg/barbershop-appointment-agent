import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserInvitations1790543471661 implements MigrationInterface {
  name = 'AddUserInvitations1790543471661';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_invitations" ("id" uuid NOT NULL, "barbershop_id" uuid NOT NULL, "email" character varying(254) NOT NULL, "name" character varying(100) NOT NULL, "token_hash" character(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "accepted_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_c8005acb91c3ce9a7ae581eca8f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "user_invitations_token_hash_unique" ON "user_invitations"  ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "user_invitations_barbershop_email_idx" ON "user_invitations"  ("barbershop_id", "email") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_invitations" ADD CONSTRAINT "FK_5f0549a00da9a390cde95e7d9aa" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_invitations" DROP CONSTRAINT "FK_5f0549a00da9a390cde95e7d9aa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."user_invitations_barbershop_email_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."user_invitations_token_hash_unique"`,
    );
    await queryRunner.query(`DROP TABLE "user_invitations"`);
  }
}

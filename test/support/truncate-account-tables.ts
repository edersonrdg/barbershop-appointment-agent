import type { DataSource } from 'typeorm';

export async function truncateAccountTables(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.query(
    'TRUNCATE user_invitations, password_reset_tokens, users, barbershops RESTART IDENTITY CASCADE',
  );
}

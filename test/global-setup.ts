import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { validateEnv } from '../src/infrastructure/config/env.schema';
import { buildTypeOrmOptions } from '../src/infrastructure/database/typeorm.options';

// AD-006: as suites de e2e compartilham o Postgres do compose, então as
// migrations rodam uma única vez aqui, antes de qualquer suite subir a app.
export default async function globalSetup(): Promise<void> {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  const dataSource = new DataSource(
    buildTypeOrmOptions(validateEnv(process.env)),
  );
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}

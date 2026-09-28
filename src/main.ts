import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './infrastructure/config/env.schema';
import { setupApiDocs } from './infrastructure/http/api-docs';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('API_DOCS_ENABLED', { infer: true })) {
    setupApiDocs(app);
  }
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();

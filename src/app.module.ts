import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type Env } from './infrastructure/config/env.schema';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AccountModule } from './infrastructure/modules/account.module';
import { buildLoggerOptions } from './infrastructure/observability/logger.options';
import { ObservabilityModule } from './infrastructure/observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildLoggerOptions({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
        }),
    }),
    DatabaseModule,
    ObservabilityModule,
    AccountModule,
  ],
})
export class AppModule {}

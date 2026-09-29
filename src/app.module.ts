import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule as CronScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type Env } from './infrastructure/config/env.schema';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AccountModule } from './infrastructure/modules/account.module';
import { BarberBlocksModule } from './infrastructure/modules/barber-blocks.module';
import { BarbersModule } from './infrastructure/modules/barbers.module';
import { BarbershopSettingsModule } from './infrastructure/modules/barbershop-settings.module';
import { BookingRulesModule } from './infrastructure/modules/booking-rules.module';
import { ManualBookingModule } from './infrastructure/modules/manual-booking.module';
import { ScheduleModule } from './infrastructure/modules/schedule.module';
import { SchedulingModule } from './infrastructure/modules/scheduling.module';
import { ServicesModule } from './infrastructure/modules/services.module';
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
    CronScheduleModule.forRoot(),
    DatabaseModule,
    ObservabilityModule,
    AccountModule,
    BarbershopSettingsModule,
    BookingRulesModule,
    ServicesModule,
    BarbersModule,
    SchedulingModule,
    ScheduleModule,
    BarberBlocksModule,
    ManualBookingModule,
  ],
})
export class AppModule {}

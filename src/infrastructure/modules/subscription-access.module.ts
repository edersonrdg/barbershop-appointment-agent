import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Registry } from 'prom-client';
import { DataSource } from 'typeorm';
import { GetSuspensionReasonUseCase } from '../../usecases/get-suspension-reason/get-suspension-reason.use-case';
import { Clock, CLOCK } from '../../usecases/ports/clock.port';
import { PAYMENT_METRICS } from '../../usecases/ports/payment-metrics.port';
import {
  SUBSCRIPTION_REPOSITORY,
  SubscriptionRepository,
} from '../../usecases/ports/subscription.repository.port';
import type { Env } from '../config/env.schema';
import { TypeOrmSubscriptionRepository } from '../database/repositories/typeorm-subscription.repository';
import { METRICS_REGISTRY } from '../observability/metrics.registry';
import { ObservabilityModule } from '../observability/observability.module';
import { PrometheusPaymentMetrics } from '../observability/prometheus-payment-metrics';
import { SystemClock } from '../security/system-clock';

// US-21: the subscription state the panel guard (AccountModule), the bot
// (WhatsAppModule) and the billing routes (SubscriptionsModule) all read.
@Module({
  imports: [ObservabilityModule],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: SUBSCRIPTION_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmSubscriptionRepository(dataSource),
    },
    {
      provide: PAYMENT_METRICS,
      inject: [METRICS_REGISTRY],
      useFactory: (registry: Registry) =>
        new PrometheusPaymentMetrics(registry),
    },
    {
      provide: GetSuspensionReasonUseCase,
      inject: [SUBSCRIPTION_REPOSITORY, CLOCK, ConfigService],
      useFactory: (
        subscriptions: SubscriptionRepository,
        clock: Clock,
        config: ConfigService<Env, true>,
      ) =>
        new GetSuspensionReasonUseCase(
          subscriptions,
          clock,
          config.get('SUBSCRIPTION_GRACE_DAYS', { infer: true }),
        ),
    },
  ],
  exports: [
    SUBSCRIPTION_REPOSITORY,
    PAYMENT_METRICS,
    GetSuspensionReasonUseCase,
  ],
})
export class SubscriptionAccessModule {}

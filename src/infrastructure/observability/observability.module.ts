import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import type { Registry } from 'prom-client';
import { HealthController } from './health.controller';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsController } from './metrics.controller';
import {
  createHttpRequestDuration,
  createMetricsRegistry,
  HTTP_REQUEST_DURATION,
  METRICS_REGISTRY,
} from './metrics.registry';

@Module({
  imports: [TerminusModule.forRoot({ logger: false })],
  controllers: [HealthController, MetricsController],
  providers: [
    { provide: METRICS_REGISTRY, useFactory: createMetricsRegistry },
    {
      provide: HTTP_REQUEST_DURATION,
      inject: [METRICS_REGISTRY],
      useFactory: (registry: Registry) => createHttpRequestDuration(registry),
    },
  ],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*path');
  }
}

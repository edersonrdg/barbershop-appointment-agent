import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Registry } from 'prom-client';
import { DataSource } from 'typeorm';
import { SubscriptionController } from '../../interface-adapters/controllers/subscription.controller';
import { ApplyPaymentEventUseCase } from '../../usecases/apply-payment-event/apply-payment-event.use-case';
import { CancelSubscriptionUseCase } from '../../usecases/cancel-subscription/cancel-subscription.use-case';
import { GetSubscriptionUseCase } from '../../usecases/get-subscription/get-subscription.use-case';
import {
  BARBERSHOP_REPOSITORY,
  BarbershopRepository,
} from '../../usecases/ports/barbershop.repository.port';
import { Clock, CLOCK } from '../../usecases/ports/clock.port';
import {
  EMAIL_SENDER,
  EmailSender,
} from '../../usecases/ports/email-sender.port';
import {
  PAYMENT_GATEWAY,
  PaymentGateway,
} from '../../usecases/ports/payment-gateway.port';
import {
  PAYMENT_METRICS,
  PaymentMetrics,
} from '../../usecases/ports/payment-metrics.port';
import {
  SUBSCRIPTION_REPOSITORY,
  SubscriptionRepository,
} from '../../usecases/ports/subscription.repository.port';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../usecases/ports/user.repository.port';
import { SendTrialEndingWarningsUseCase } from '../../usecases/send-trial-ending-warnings/send-trial-ending-warnings.use-case';
import { StartSubscriptionCheckoutUseCase } from '../../usecases/start-subscription-checkout/start-subscription-checkout.use-case';
import type { Env } from '../config/env.schema';
import { TypeOrmSubscriptionRepository } from '../database/repositories/typeorm-subscription.repository';
import { AsaasPaymentGateway } from '../external/payments/asaas/asaas-payment-gateway';
import { AsaasWebhookController } from '../external/payments/asaas/asaas-webhook.controller';
import { AsaasWebhookGuard } from '../external/payments/asaas/asaas-webhook.guard';
import { TrialEndingWarningJob } from '../jobs/trial-ending-warning.job';
import { METRICS_REGISTRY } from '../observability/metrics.registry';
import { ObservabilityModule } from '../observability/observability.module';
import { PrometheusPaymentMetrics } from '../observability/prometheus-payment-metrics';
import { SystemClock } from '../security/system-clock';
import { AccountModule } from './account.module';

// US-20: subscription billing through the payment gateway (door 4), its
// webhook and the trial-ending warning.
@Module({
  imports: [AccountModule, ObservabilityModule],
  controllers: [SubscriptionController, AsaasWebhookController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    AsaasWebhookGuard,
    {
      provide: SUBSCRIPTION_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmSubscriptionRepository(dataSource),
    },
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new AsaasPaymentGateway({
          baseUrl: config.get('ASAAS_API_URL', { infer: true }),
          apiKey: config.get('ASAAS_API_KEY', { infer: true }),
          timeoutMs: config.get('ASAAS_TIMEOUT_MS', { infer: true }),
        }),
    },
    {
      provide: PAYMENT_METRICS,
      inject: [METRICS_REGISTRY],
      useFactory: (registry: Registry) =>
        new PrometheusPaymentMetrics(registry),
    },
    {
      provide: GetSubscriptionUseCase,
      inject: [SUBSCRIPTION_REPOSITORY, CLOCK, ConfigService],
      useFactory: (
        subscriptions: SubscriptionRepository,
        clock: Clock,
        config: ConfigService<Env, true>,
      ) =>
        new GetSubscriptionUseCase(subscriptions, clock, {
          priceCents: config.get('SUBSCRIPTION_PRICE_CENTS', { infer: true }),
          warningDays: config.get('SUBSCRIPTION_TRIAL_WARNING_DAYS', {
            infer: true,
          }),
        }),
    },
    {
      provide: StartSubscriptionCheckoutUseCase,
      inject: [
        SUBSCRIPTION_REPOSITORY,
        BARBERSHOP_REPOSITORY,
        USER_REPOSITORY,
        PAYMENT_GATEWAY,
        CLOCK,
        ConfigService,
      ],
      useFactory: (
        subscriptions: SubscriptionRepository,
        barbershops: BarbershopRepository,
        users: UserRepository,
        gateway: PaymentGateway,
        clock: Clock,
        config: ConfigService<Env, true>,
      ) =>
        new StartSubscriptionCheckoutUseCase(
          subscriptions,
          barbershops,
          users,
          gateway,
          clock,
          {
            priceCents: config.get('SUBSCRIPTION_PRICE_CENTS', { infer: true }),
            appWebUrl: config.get('APP_WEB_URL', { infer: true }),
          },
        ),
    },
    {
      provide: CancelSubscriptionUseCase,
      inject: [SUBSCRIPTION_REPOSITORY, PAYMENT_GATEWAY, CLOCK],
      useFactory: (
        subscriptions: SubscriptionRepository,
        gateway: PaymentGateway,
        clock: Clock,
      ) => new CancelSubscriptionUseCase(subscriptions, gateway, clock),
    },
    {
      provide: ApplyPaymentEventUseCase,
      inject: [
        SUBSCRIPTION_REPOSITORY,
        PAYMENT_GATEWAY,
        BARBERSHOP_REPOSITORY,
        USER_REPOSITORY,
        EMAIL_SENDER,
        PAYMENT_METRICS,
        CLOCK,
      ],
      useFactory: (
        subscriptions: SubscriptionRepository,
        gateway: PaymentGateway,
        barbershops: BarbershopRepository,
        users: UserRepository,
        emailSender: EmailSender,
        metrics: PaymentMetrics,
        clock: Clock,
      ) =>
        new ApplyPaymentEventUseCase(
          subscriptions,
          gateway,
          barbershops,
          users,
          emailSender,
          metrics,
          clock,
        ),
    },
    {
      provide: SendTrialEndingWarningsUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        SUBSCRIPTION_REPOSITORY,
        USER_REPOSITORY,
        EMAIL_SENDER,
        CLOCK,
        ConfigService,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        subscriptions: SubscriptionRepository,
        users: UserRepository,
        emailSender: EmailSender,
        clock: Clock,
        config: ConfigService<Env, true>,
      ) =>
        new SendTrialEndingWarningsUseCase(
          barbershops,
          subscriptions,
          users,
          emailSender,
          clock,
          {
            warningDays: config.get('SUBSCRIPTION_TRIAL_WARNING_DAYS', {
              infer: true,
            }),
            appWebUrl: config.get('APP_WEB_URL', { infer: true }),
          },
        ),
    },
    TrialEndingWarningJob,
  ],
})
export class SubscriptionsModule {}

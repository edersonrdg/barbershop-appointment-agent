import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Registry } from 'prom-client';
import { DataSource } from 'typeorm';
import { WhatsAppConnectionController } from '../../interface-adapters/controllers/whatsapp-connection.controller';
import { ApplyWhatsAppConnectionStateUseCase } from '../../usecases/apply-whatsapp-connection-state/apply-whatsapp-connection-state.use-case';
import { ConnectWhatsAppUseCase } from '../../usecases/connect-whatsapp/connect-whatsapp.use-case';
import { GetWhatsAppConnectionUseCase } from '../../usecases/get-whatsapp-connection/get-whatsapp-connection.use-case';
import {
  BARBERSHOP_REPOSITORY,
  BarbershopRepository,
} from '../../usecases/ports/barbershop.repository.port';
import {
  CLIENT_REPOSITORY,
  ClientRepository,
} from '../../usecases/ports/client.repository.port';
import { Clock, CLOCK } from '../../usecases/ports/clock.port';
import {
  EMAIL_SENDER,
  EmailSender,
} from '../../usecases/ports/email-sender.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../usecases/ports/id-generator.port';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../usecases/ports/user.repository.port';
import {
  WHATSAPP_CONNECTION_REPOSITORY,
  WhatsAppConnectionRepository,
} from '../../usecases/ports/whatsapp-connection.repository.port';
import {
  WHATSAPP_CONNECTOR,
  WhatsAppConnector,
} from '../../usecases/ports/whatsapp-connector.port';
import {
  WHATSAPP_METRICS,
  WhatsAppMetrics,
} from '../../usecases/ports/whatsapp-metrics.port';
import { ReceiveWhatsAppMessageUseCase } from '../../usecases/receive-whatsapp-message/receive-whatsapp-message.use-case';
import type { Env } from '../config/env.schema';
import { TypeOrmClientRepository } from '../database/repositories/typeorm-client.repository';
import { TypeOrmWhatsAppConnectionRepository } from '../database/repositories/typeorm-whatsapp-connection.repository';
import { EvolutionWebhookController } from '../external/whatsapp/evolution/evolution-webhook.controller';
import { EvolutionWebhookGuard } from '../external/whatsapp/evolution/evolution-webhook.guard';
import { EvolutionWhatsAppConnector } from '../external/whatsapp/evolution/evolution-whatsapp-connector';
import { METRICS_REGISTRY } from '../observability/metrics.registry';
import { ObservabilityModule } from '../observability/observability.module';
import { PrometheusWhatsAppMetrics } from '../observability/prometheus-whatsapp-metrics';
import { SystemClock } from '../security/system-clock';
import { UuidIdGenerator } from '../security/uuid-id-generator';
import { AccountModule } from './account.module';

// US-13: WhatsApp connection; US-14: first contact and privacy notice. Global so the readiness check can ping the
// connector through the port (AD-011).
@Global()
@Module({
  imports: [AccountModule, ObservabilityModule],
  controllers: [WhatsAppConnectionController, EvolutionWebhookController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidIdGenerator },
    EvolutionWebhookGuard,
    {
      provide: WHATSAPP_CONNECTOR,
      inject: [ConfigService, METRICS_REGISTRY],
      useFactory: (config: ConfigService<Env, true>, registry: Registry) =>
        new EvolutionWhatsAppConnector(
          {
            baseUrl: config.get('EVOLUTION_API_URL', { infer: true }),
            apiKey: config.get('EVOLUTION_API_KEY', { infer: true }),
            timeoutMs: config.get('EVOLUTION_TIMEOUT_MS', { infer: true }),
            webhookUrl: config.get('WHATSAPP_WEBHOOK_URL', { infer: true }),
            webhookSecret: config.get('WHATSAPP_WEBHOOK_SECRET', {
              infer: true,
            }),
          },
          registry,
        ),
    },
    {
      provide: WHATSAPP_CONNECTION_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmWhatsAppConnectionRepository(dataSource),
    },
    {
      provide: CLIENT_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmClientRepository(dataSource),
    },
    {
      provide: WHATSAPP_METRICS,
      inject: [METRICS_REGISTRY],
      useFactory: (registry: Registry) =>
        new PrometheusWhatsAppMetrics(registry),
    },
    {
      provide: ApplyWhatsAppConnectionStateUseCase,
      inject: [
        WHATSAPP_CONNECTION_REPOSITORY,
        BARBERSHOP_REPOSITORY,
        USER_REPOSITORY,
        EMAIL_SENDER,
        WHATSAPP_METRICS,
        CLOCK,
        ConfigService,
      ],
      useFactory: (
        connections: WhatsAppConnectionRepository,
        barbershops: BarbershopRepository,
        users: UserRepository,
        emailSender: EmailSender,
        metrics: WhatsAppMetrics,
        clock: Clock,
        config: ConfigService<Env, true>,
      ) =>
        new ApplyWhatsAppConnectionStateUseCase(
          connections,
          barbershops,
          users,
          emailSender,
          metrics,
          clock,
          config.get('APP_WEB_URL', { infer: true }),
        ),
    },
    {
      provide: GetWhatsAppConnectionUseCase,
      inject: [
        WHATSAPP_CONNECTION_REPOSITORY,
        WHATSAPP_CONNECTOR,
        ApplyWhatsAppConnectionStateUseCase,
        CLOCK,
      ],
      useFactory: (
        connections: WhatsAppConnectionRepository,
        connector: WhatsAppConnector,
        applyState: ApplyWhatsAppConnectionStateUseCase,
        clock: Clock,
      ) =>
        new GetWhatsAppConnectionUseCase(
          connections,
          connector,
          applyState,
          clock,
        ),
    },
    {
      provide: ConnectWhatsAppUseCase,
      inject: [WHATSAPP_CONNECTION_REPOSITORY, WHATSAPP_CONNECTOR, CLOCK],
      useFactory: (
        connections: WhatsAppConnectionRepository,
        connector: WhatsAppConnector,
        clock: Clock,
      ) => new ConnectWhatsAppUseCase(connections, connector, clock),
    },
    {
      provide: ReceiveWhatsAppMessageUseCase,
      inject: [
        WHATSAPP_CONNECTION_REPOSITORY,
        BARBERSHOP_REPOSITORY,
        CLIENT_REPOSITORY,
        WHATSAPP_CONNECTOR,
        WHATSAPP_METRICS,
        ID_GENERATOR,
        CLOCK,
        ConfigService,
      ],
      useFactory: (
        connections: WhatsAppConnectionRepository,
        barbershops: BarbershopRepository,
        clients: ClientRepository,
        connector: WhatsAppConnector,
        metrics: WhatsAppMetrics,
        ids: IdGenerator,
        clock: Clock,
        config: ConfigService<Env, true>,
      ) =>
        new ReceiveWhatsAppMessageUseCase(
          connections,
          barbershops,
          clients,
          connector,
          metrics,
          ids,
          clock,
          config.get('PRIVACY_POLICY_URL', { infer: true }),
        ),
    },
  ],
  exports: [WHATSAPP_CONNECTOR],
})
export class WhatsAppModule {}

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import type { Registry } from 'prom-client';
import { DataSource } from 'typeorm';
import { AuthController } from '../../interface-adapters/controllers/auth.controller';
import {
  ACCESS_TOKEN_ISSUER,
  AccessTokenIssuer,
} from '../../usecases/ports/access-token-issuer.port';
import {
  ACCOUNT_METRICS,
  AccountMetrics,
} from '../../usecases/ports/account-metrics.port';
import {
  BARBERSHOP_REPOSITORY,
  BarbershopRepository,
} from '../../usecases/ports/barbershop.repository.port';
import { Clock, CLOCK } from '../../usecases/ports/clock.port';
import { EMAIL_SENDER } from '../../usecases/ports/email-sender.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../usecases/ports/id-generator.port';
import {
  PASSWORD_HASHER,
  PasswordHasher,
} from '../../usecases/ports/password-hasher.port';
import { PASSWORD_RESET_REPOSITORY } from '../../usecases/ports/password-reset.repository.port';
import { RESET_TOKEN_GENERATOR } from '../../usecases/ports/reset-token-generator.port';
import { USER_REPOSITORY } from '../../usecases/ports/user.repository.port';
import { RegisterBarbershopUseCase } from '../../usecases/register-barbershop/register-barbershop.use-case';
import type { Env } from '../config/env.schema';
import { TypeOrmBarbershopRepository } from '../database/repositories/typeorm-barbershop.repository';
import { TypeOrmPasswordResetRepository } from '../database/repositories/typeorm-password-reset.repository';
import { TypeOrmUserRepository } from '../database/repositories/typeorm-user.repository';
import {
  createSmtpTransport,
  SmtpEmailSender,
} from '../external/email/smtp-email-sender';
import { DomainErrorFilter } from '../http/domain-error.filter';
import { SessionGuard } from '../http/session.guard';
import { METRICS_REGISTRY } from '../observability/metrics.registry';
import { ObservabilityModule } from '../observability/observability.module';
import { PrometheusAccountMetrics } from '../observability/prometheus-account-metrics';
import { CryptoResetTokenGenerator } from '../security/crypto-reset-token-generator';
import { JwtAccessTokenIssuer } from '../security/jwt-access-token-issuer';
import { ScryptPasswordHasher } from '../security/scrypt-password-hasher';
import { SystemClock } from '../security/system-clock';
import { UuidIdGenerator } from '../security/uuid-id-generator';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    ObservabilityModule,
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: BARBERSHOP_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmBarbershopRepository(dataSource),
    },
    {
      provide: USER_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmUserRepository(dataSource),
    },
    {
      provide: PASSWORD_RESET_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmPasswordResetRepository(dataSource),
    },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: RESET_TOKEN_GENERATOR, useClass: CryptoResetTokenGenerator },
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidIdGenerator },
    {
      provide: ACCESS_TOKEN_ISSUER,
      inject: [JwtService, ConfigService],
      useFactory: (jwtService: JwtService, config: ConfigService<Env, true>) =>
        new JwtAccessTokenIssuer(
          jwtService,
          config.get('AUTH_SESSION_TTL_SECONDS', { infer: true }),
        ),
    },
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new SmtpEmailSender(
          createSmtpTransport({
            SMTP_HOST: config.get('SMTP_HOST', { infer: true }),
            SMTP_PORT: config.get('SMTP_PORT', { infer: true }),
            SMTP_SECURE: config.get('SMTP_SECURE', { infer: true }),
            SMTP_USER: config.get('SMTP_USER', { infer: true }),
            SMTP_PASSWORD: config.get('SMTP_PASSWORD', { infer: true }),
          }),
          config.get('MAIL_FROM', { infer: true }),
        ),
    },
    {
      provide: ACCOUNT_METRICS,
      inject: [METRICS_REGISTRY],
      useFactory: (registry: Registry) =>
        new PrometheusAccountMetrics(registry),
    },
    {
      provide: RegisterBarbershopUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        PASSWORD_HASHER,
        ACCESS_TOKEN_ISSUER,
        CLOCK,
        ID_GENERATOR,
        ACCOUNT_METRICS,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        passwordHasher: PasswordHasher,
        accessTokenIssuer: AccessTokenIssuer,
        clock: Clock,
        idGenerator: IdGenerator,
        metrics: AccountMetrics,
      ) =>
        new RegisterBarbershopUseCase(
          barbershops,
          passwordHasher,
          accessTokenIssuer,
          clock,
          idGenerator,
          metrics,
        ),
    },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AccountModule {}

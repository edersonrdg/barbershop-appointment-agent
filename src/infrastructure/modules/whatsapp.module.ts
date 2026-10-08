import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Registry } from 'prom-client';
import { DataSource } from 'typeorm';
import { WhatsAppConnectionController } from '../../interface-adapters/controllers/whatsapp-connection.controller';
import { WhatsAppConversationsController } from '../../interface-adapters/controllers/whatsapp-conversations.controller';
import { AnswerClientQuestionUseCase } from '../../usecases/answer-client-question/answer-client-question.use-case';
import { BookAppointmentUseCase } from '../../usecases/book-appointment/book-appointment.use-case';
import { BookViaWhatsAppUseCase } from '../../usecases/book-via-whatsapp/book-via-whatsapp.use-case';
import { ConfirmPresenceViaWhatsAppUseCase } from '../../usecases/confirm-presence-via-whatsapp/confirm-presence-via-whatsapp.use-case';
import { GetSuspensionReasonUseCase } from '../../usecases/get-suspension-reason/get-suspension-reason.use-case';
import { ListAvailableSlotsUseCase } from '../../usecases/list-available-slots/list-available-slots.use-case';
import {
  APPOINTMENT_METRICS,
  AppointmentMetrics,
} from '../../usecases/ports/appointment-metrics.port';
import {
  APPOINTMENT_REPOSITORY,
  AppointmentRepository,
} from '../../usecases/ports/appointment.repository.port';
import {
  SCHEDULE_QUERY,
  ScheduleQuery,
} from '../../usecases/ports/schedule.query.port';
import {
  BARBER_REPOSITORY,
  BarberRepository,
} from '../../usecases/ports/barber.repository.port';
import {
  BOOKING_RULES_REPOSITORY,
  BookingRulesRepository,
} from '../../usecases/ports/booking-rules.repository.port';
import {
  NO_SHOW_LEDGER,
  NoShowLedger,
} from '../../usecases/ports/no-show-ledger.port';
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
  CONVERSATION_REPOSITORY,
  ConversationRepository,
} from '../../usecases/ports/conversation.repository.port';
import {
  EMAIL_SENDER,
  EmailSender,
} from '../../usecases/ports/email-sender.port';
import {
  INBOUND_MESSAGE_REPOSITORY,
  InboundMessageRepository,
} from '../../usecases/ports/inbound-message.repository.port';
import {
  MESSAGE_INTERPRETER,
  MessageInterpreter,
} from '../../usecases/ports/message-interpreter.port';
import {
  SERVICE_REPOSITORY,
  ServiceRepository,
} from '../../usecases/ports/service.repository.port';
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
import { ListWaitingConversationsUseCase } from '../../usecases/list-waiting-conversations/list-waiting-conversations.use-case';
import { ReceiveWhatsAppMessageUseCase } from '../../usecases/receive-whatsapp-message/receive-whatsapp-message.use-case';
import { RecordConversationActivityUseCase } from '../../usecases/record-conversation-activity/record-conversation-activity.use-case';
import { ResumeConversationUseCase } from '../../usecases/resume-conversation/resume-conversation.use-case';
import { SendAppointmentRemindersUseCase } from '../../usecases/send-appointment-reminders/send-appointment-reminders.use-case';
import { ProcessWaitlistUseCase } from '../../usecases/process-waitlist/process-waitlist.use-case';
import { ChangeReturnReminderViaWhatsAppUseCase } from '../../usecases/change-return-reminder-via-whatsapp/change-return-reminder-via-whatsapp.use-case';
import {
  RETURN_REMINDER_METRICS,
  ReturnReminderMetrics,
} from '../../usecases/ports/return-reminder-metrics.port';
import { SendReturnRemindersUseCase } from '../../usecases/send-return-reminders/send-return-reminders.use-case';
import {
  WAITLIST_METRICS,
  WaitlistMetrics,
} from '../../usecases/ports/waitlist-metrics.port';
import {
  WAITLIST_REPOSITORY,
  WaitlistRepository,
} from '../../usecases/ports/waitlist.repository.port';
import type { Env } from '../config/env.schema';
import { TypeOrmInboundMessageRepository } from '../database/repositories/typeorm-inbound-message.repository';
import { TypeOrmClientRepository } from '../database/repositories/typeorm-client.repository';
import { TypeOrmConversationRepository } from '../database/repositories/typeorm-conversation.repository';
import { TypeOrmWhatsAppConnectionRepository } from '../database/repositories/typeorm-whatsapp-connection.repository';
import { TypeOrmWaitlistRepository } from '../database/repositories/typeorm-waitlist.repository';
import { EvolutionWebhookController } from '../external/whatsapp/evolution/evolution-webhook.controller';
import { EvolutionWebhookGuard } from '../external/whatsapp/evolution/evolution-webhook.guard';
import { EvolutionWhatsAppConnector } from '../external/whatsapp/evolution/evolution-whatsapp-connector';
import { AppointmentRemindersJob } from '../jobs/appointment-reminders.job';
import { WaitlistJob } from '../jobs/waitlist.job';
import { ReturnReminderJob } from '../jobs/return-reminder.job';
import { METRICS_REGISTRY } from '../observability/metrics.registry';
import { ObservabilityModule } from '../observability/observability.module';
import { PrometheusWaitlistMetrics } from '../observability/prometheus-waitlist-metrics';
import { PrometheusReturnReminderMetrics } from '../observability/prometheus-return-reminder-metrics';
import { PrometheusWhatsAppMetrics } from '../observability/prometheus-whatsapp-metrics';
import { SystemClock } from '../security/system-clock';
import { UuidIdGenerator } from '../security/uuid-id-generator';
import { AccountModule } from './account.module';
import { AttendanceModule } from './attendance.module';
import { BarbersModule } from './barbers.module';
import { BookingRulesModule } from './booking-rules.module';
import { SubscriptionAccessModule } from './subscription-access.module';
import { GeminiModule } from './gemini.module';
import { ScheduleModule } from './schedule.module';
import { SchedulingModule } from './scheduling.module';
import { ServicesModule } from './services.module';

// US-13: WhatsApp connection; US-14: first contact and privacy notice; US-15:
// answers to the client's questions; US-16: hand-off to a human; US-17:
// booking through the availability engine; US-19: appointment reminders and
// the client's confirmation; US-24: the waitlist. Global so the readiness check can
// ping the connector through the port (AD-011).
@Global()
@Module({
  imports: [
    AccountModule,
    ObservabilityModule,
    ServicesModule,
    GeminiModule,
    BarbersModule,
    BookingRulesModule,
    SchedulingModule,
    ScheduleModule,
    AttendanceModule,
    SubscriptionAccessModule,
  ],
  controllers: [
    WhatsAppConnectionController,
    WhatsAppConversationsController,
    EvolutionWebhookController,
  ],
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
      provide: INBOUND_MESSAGE_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmInboundMessageRepository(dataSource),
    },
    {
      provide: CONVERSATION_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmConversationRepository(dataSource),
    },
    {
      provide: WAITLIST_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmWaitlistRepository(dataSource),
    },
    {
      provide: WAITLIST_METRICS,
      inject: [METRICS_REGISTRY],
      useFactory: (registry: Registry) =>
        new PrometheusWaitlistMetrics(registry),
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
    {
      provide: BookViaWhatsAppUseCase,
      inject: [
        BARBER_REPOSITORY,
        BOOKING_RULES_REPOSITORY,
        NO_SHOW_LEDGER,
        CONVERSATION_REPOSITORY,
        ListAvailableSlotsUseCase,
        BookAppointmentUseCase,
        ID_GENERATOR,
        SCHEDULE_QUERY,
        APPOINTMENT_REPOSITORY,
        APPOINTMENT_METRICS,
        WAITLIST_REPOSITORY,
        WAITLIST_METRICS,
      ],
      useFactory: (
        barbers: BarberRepository,
        bookingRules: BookingRulesRepository,
        ledger: NoShowLedger,
        conversations: ConversationRepository,
        listSlots: ListAvailableSlotsUseCase,
        book: BookAppointmentUseCase,
        ids: IdGenerator,
        schedule: ScheduleQuery,
        appointments: AppointmentRepository,
        appointmentMetrics: AppointmentMetrics,
        waitlist: WaitlistRepository,
        waitlistMetrics: WaitlistMetrics,
      ) =>
        new BookViaWhatsAppUseCase(
          barbers,
          bookingRules,
          ledger,
          conversations,
          listSlots,
          book,
          ids,
          schedule,
          appointments,
          appointmentMetrics,
          waitlist,
          waitlistMetrics,
        ),
    },
    {
      provide: AnswerClientQuestionUseCase,
      inject: [
        WHATSAPP_CONNECTION_REPOSITORY,
        BARBERSHOP_REPOSITORY,
        SERVICE_REPOSITORY,
        INBOUND_MESSAGE_REPOSITORY,
        MESSAGE_INTERPRETER,
        WHATSAPP_CONNECTOR,
        WHATSAPP_METRICS,
        CLOCK,
        CLIENT_REPOSITORY,
        CONVERSATION_REPOSITORY,
        ConfigService,
        BookViaWhatsAppUseCase,
        ConfirmPresenceViaWhatsAppUseCase,
        GetSuspensionReasonUseCase,
        ChangeReturnReminderViaWhatsAppUseCase,
      ],
      useFactory: (
        connections: WhatsAppConnectionRepository,
        barbershops: BarbershopRepository,
        services: ServiceRepository,
        inboundMessages: InboundMessageRepository,
        interpreter: MessageInterpreter,
        connector: WhatsAppConnector,
        metrics: WhatsAppMetrics,
        clock: Clock,
        clients: ClientRepository,
        conversations: ConversationRepository,
        config: ConfigService<Env, true>,
        booking: BookViaWhatsAppUseCase,
        presence: ConfirmPresenceViaWhatsAppUseCase,
        suspension: GetSuspensionReasonUseCase,
        returnReminder: ChangeReturnReminderViaWhatsAppUseCase,
      ) =>
        new AnswerClientQuestionUseCase(
          connections,
          barbershops,
          services,
          inboundMessages,
          interpreter,
          connector,
          metrics,
          clock,
          clients,
          conversations,
          config.get('WHATSAPP_HANDOFF_RESUME_HOURS', { infer: true }),
          booking,
          presence,
          suspension,
          returnReminder,
        ),
    },
    {
      provide: RETURN_REMINDER_METRICS,
      inject: [METRICS_REGISTRY],
      useFactory: (registry: Registry) =>
        new PrometheusReturnReminderMetrics(registry),
    },
    {
      provide: ChangeReturnReminderViaWhatsAppUseCase,
      inject: [
        CLIENT_REPOSITORY,
        BOOKING_RULES_REPOSITORY,
        RETURN_REMINDER_METRICS,
        ID_GENERATOR,
      ],
      useFactory: (
        clients: ClientRepository,
        bookingRules: BookingRulesRepository,
        metrics: ReturnReminderMetrics,
        ids: IdGenerator,
      ) =>
        new ChangeReturnReminderViaWhatsAppUseCase(
          clients,
          bookingRules,
          metrics,
          ids,
        ),
    },
    {
      provide: SendReturnRemindersUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        WHATSAPP_CONNECTION_REPOSITORY,
        GetSuspensionReasonUseCase,
        SCHEDULE_QUERY,
        CLIENT_REPOSITORY,
        APPOINTMENT_REPOSITORY,
        BOOKING_RULES_REPOSITORY,
        NO_SHOW_LEDGER,
        CONVERSATION_REPOSITORY,
        WHATSAPP_CONNECTOR,
        RETURN_REMINDER_METRICS,
        CLOCK,
        ConfigService,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        connections: WhatsAppConnectionRepository,
        suspension: GetSuspensionReasonUseCase,
        schedule: ScheduleQuery,
        clients: ClientRepository,
        appointments: AppointmentRepository,
        bookingRules: BookingRulesRepository,
        ledger: NoShowLedger,
        conversations: ConversationRepository,
        connector: WhatsAppConnector,
        metrics: ReturnReminderMetrics,
        clock: Clock,
        config: ConfigService<Env, true>,
      ) =>
        new SendReturnRemindersUseCase(
          barbershops,
          connections,
          suspension,
          schedule,
          clients,
          appointments,
          bookingRules,
          ledger,
          conversations,
          connector,
          metrics,
          clock,
          config.get('WHATSAPP_HANDOFF_RESUME_HOURS', { infer: true }),
        ),
    },
    ReturnReminderJob,
    {
      provide: ConfirmPresenceViaWhatsAppUseCase,
      inject: [SCHEDULE_QUERY, APPOINTMENT_REPOSITORY],
      useFactory: (
        schedule: ScheduleQuery,
        appointments: AppointmentRepository,
      ) => new ConfirmPresenceViaWhatsAppUseCase(schedule, appointments),
    },
    {
      provide: SendAppointmentRemindersUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        WHATSAPP_CONNECTION_REPOSITORY,
        SCHEDULE_QUERY,
        APPOINTMENT_REPOSITORY,
        WHATSAPP_CONNECTOR,
        WHATSAPP_METRICS,
        CLOCK,
        GetSuspensionReasonUseCase,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        connections: WhatsAppConnectionRepository,
        schedule: ScheduleQuery,
        appointments: AppointmentRepository,
        connector: WhatsAppConnector,
        metrics: WhatsAppMetrics,
        clock: Clock,
        suspension: GetSuspensionReasonUseCase,
      ) =>
        new SendAppointmentRemindersUseCase(
          barbershops,
          connections,
          schedule,
          appointments,
          connector,
          metrics,
          clock,
          suspension,
        ),
    },
    AppointmentRemindersJob,
    {
      provide: ProcessWaitlistUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        WHATSAPP_CONNECTION_REPOSITORY,
        GetSuspensionReasonUseCase,
        WAITLIST_REPOSITORY,
        SCHEDULE_QUERY,
        ListAvailableSlotsUseCase,
        BOOKING_RULES_REPOSITORY,
        NO_SHOW_LEDGER,
        CONVERSATION_REPOSITORY,
        CLIENT_REPOSITORY,
        SERVICE_REPOSITORY,
        WHATSAPP_CONNECTOR,
        WAITLIST_METRICS,
        ID_GENERATOR,
        CLOCK,
        ConfigService,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        connections: WhatsAppConnectionRepository,
        suspension: GetSuspensionReasonUseCase,
        waitlist: WaitlistRepository,
        schedule: ScheduleQuery,
        listSlots: ListAvailableSlotsUseCase,
        bookingRules: BookingRulesRepository,
        ledger: NoShowLedger,
        conversations: ConversationRepository,
        clients: ClientRepository,
        services: ServiceRepository,
        connector: WhatsAppConnector,
        metrics: WaitlistMetrics,
        ids: IdGenerator,
        clock: Clock,
        config: ConfigService<Env, true>,
      ) =>
        new ProcessWaitlistUseCase(
          barbershops,
          connections,
          suspension,
          waitlist,
          schedule,
          listSlots,
          bookingRules,
          ledger,
          conversations,
          clients,
          services,
          connector,
          metrics,
          ids,
          clock,
          config.get('WHATSAPP_HANDOFF_RESUME_HOURS', { infer: true }),
        ),
    },
    WaitlistJob,
    {
      provide: RecordConversationActivityUseCase,
      inject: [
        CLIENT_REPOSITORY,
        CONVERSATION_REPOSITORY,
        CLOCK,
        ConfigService,
      ],
      useFactory: (
        clients: ClientRepository,
        conversations: ConversationRepository,
        clock: Clock,
        config: ConfigService<Env, true>,
      ) =>
        new RecordConversationActivityUseCase(
          clients,
          conversations,
          clock,
          config.get('WHATSAPP_HANDOFF_RESUME_HOURS', { infer: true }),
        ),
    },
    {
      provide: ListWaitingConversationsUseCase,
      inject: [CONVERSATION_REPOSITORY, CLOCK, ConfigService],
      useFactory: (
        conversations: ConversationRepository,
        clock: Clock,
        config: ConfigService<Env, true>,
      ) =>
        new ListWaitingConversationsUseCase(
          conversations,
          clock,
          config.get('WHATSAPP_HANDOFF_RESUME_HOURS', { infer: true }),
        ),
    },
    {
      provide: ResumeConversationUseCase,
      inject: [CLIENT_REPOSITORY, CONVERSATION_REPOSITORY, WHATSAPP_METRICS],
      useFactory: (
        clients: ClientRepository,
        conversations: ConversationRepository,
        metrics: WhatsAppMetrics,
      ) => new ResumeConversationUseCase(clients, conversations, metrics),
    },
  ],
  exports: [WHATSAPP_CONNECTOR],
})
export class WhatsAppModule {}

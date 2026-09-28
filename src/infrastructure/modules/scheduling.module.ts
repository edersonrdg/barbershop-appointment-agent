import { Module } from '@nestjs/common';
import type { Registry } from 'prom-client';
import { DataSource } from 'typeorm';
import { BookAppointmentUseCase } from '../../usecases/book-appointment/book-appointment.use-case';
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
  BARBER_BLOCK_REPOSITORY,
  BarberBlockRepository,
} from '../../usecases/ports/barber-block.repository.port';
import {
  BARBER_REPOSITORY,
  BarberRepository,
} from '../../usecases/ports/barber.repository.port';
import {
  BARBERSHOP_REPOSITORY,
  BarbershopRepository,
} from '../../usecases/ports/barbershop.repository.port';
import {
  BOOKING_RULES_REPOSITORY,
  BookingRulesRepository,
} from '../../usecases/ports/booking-rules.repository.port';
import { Clock, CLOCK } from '../../usecases/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../usecases/ports/id-generator.port';
import {
  SERVICE_REPOSITORY,
  ServiceRepository,
} from '../../usecases/ports/service.repository.port';
import { TypeOrmAppointmentRepository } from '../database/repositories/typeorm-appointment.repository';
import { TypeOrmBarberBlockRepository } from '../database/repositories/typeorm-barber-block.repository';
import { METRICS_REGISTRY } from '../observability/metrics.registry';
import { ObservabilityModule } from '../observability/observability.module';
import { PrometheusAppointmentMetrics } from '../observability/prometheus-appointment-metrics';
import { SystemClock } from '../security/system-clock';
import { UuidIdGenerator } from '../security/uuid-id-generator';
import { AccountModule } from './account.module';
import { BarbersModule } from './barbers.module';
import { BookingRulesModule } from './booking-rules.module';
import { ServicesModule } from './services.module';

// US-07: the single availability engine shared by the panel (US-10) and the
// bot (US-17). No routes here; those stories expose the use cases.
@Module({
  imports: [
    AccountModule,
    BookingRulesModule,
    BarbersModule,
    ServicesModule,
    ObservabilityModule,
  ],
  providers: [
    {
      provide: APPOINTMENT_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmAppointmentRepository(dataSource),
    },
    {
      provide: BARBER_BLOCK_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmBarberBlockRepository(dataSource),
    },
    {
      provide: APPOINTMENT_METRICS,
      inject: [METRICS_REGISTRY],
      useFactory: (registry: Registry) =>
        new PrometheusAppointmentMetrics(registry),
    },
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidIdGenerator },
    {
      provide: ListAvailableSlotsUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        BOOKING_RULES_REPOSITORY,
        BARBER_REPOSITORY,
        SERVICE_REPOSITORY,
        APPOINTMENT_REPOSITORY,
        BARBER_BLOCK_REPOSITORY,
        CLOCK,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        bookingRules: BookingRulesRepository,
        barbers: BarberRepository,
        services: ServiceRepository,
        appointments: AppointmentRepository,
        blocks: BarberBlockRepository,
        clock: Clock,
      ) =>
        new ListAvailableSlotsUseCase(
          barbershops,
          bookingRules,
          barbers,
          services,
          appointments,
          blocks,
          clock,
        ),
    },
    {
      provide: BookAppointmentUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        BOOKING_RULES_REPOSITORY,
        BARBER_REPOSITORY,
        SERVICE_REPOSITORY,
        APPOINTMENT_REPOSITORY,
        BARBER_BLOCK_REPOSITORY,
        CLOCK,
        ID_GENERATOR,
        APPOINTMENT_METRICS,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        bookingRules: BookingRulesRepository,
        barbers: BarberRepository,
        services: ServiceRepository,
        appointments: AppointmentRepository,
        blocks: BarberBlockRepository,
        clock: Clock,
        idGenerator: IdGenerator,
        metrics: AppointmentMetrics,
      ) =>
        new BookAppointmentUseCase(
          barbershops,
          bookingRules,
          barbers,
          services,
          appointments,
          blocks,
          clock,
          idGenerator,
          metrics,
        ),
    },
  ],
  exports: [
    ListAvailableSlotsUseCase,
    BookAppointmentUseCase,
    BARBER_BLOCK_REPOSITORY,
  ],
})
export class SchedulingModule {}

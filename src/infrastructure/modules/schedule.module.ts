import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ScheduleController } from '../../interface-adapters/controllers/schedule.controller';
import { ListScheduleUseCase } from '../../usecases/list-schedule/list-schedule.use-case';
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
  SCHEDULE_QUERY,
  ScheduleQuery,
} from '../../usecases/ports/schedule.query.port';
import { TypeOrmScheduleQuery } from '../database/repositories/typeorm-schedule.query';
import { SystemClock } from '../security/system-clock';
import { AccountModule } from './account.module';
import { BarbersModule } from './barbers.module';
import { BookingRulesModule } from './booking-rules.module';

// US-08: reading the schedule in the panel; US-19: the unconfirmed alert.
@Module({
  imports: [AccountModule, BarbersModule, BookingRulesModule],
  controllers: [ScheduleController],
  providers: [
    {
      provide: SCHEDULE_QUERY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmScheduleQuery(dataSource),
    },
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: ListScheduleUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        BARBER_REPOSITORY,
        SCHEDULE_QUERY,
        BOOKING_RULES_REPOSITORY,
        CLOCK,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        barbers: BarberRepository,
        schedule: ScheduleQuery,
        bookingRules: BookingRulesRepository,
        clock: Clock,
      ) =>
        new ListScheduleUseCase(
          barbershops,
          barbers,
          schedule,
          bookingRules,
          clock,
        ),
    },
  ],
  exports: [SCHEDULE_QUERY],
})
export class ScheduleModule {}

import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MarkAttendanceUseCase } from '../../usecases/mark-attendance/mark-attendance.use-case';
import {
  APPOINTMENT_REPOSITORY,
  AppointmentRepository,
} from '../../usecases/ports/appointment.repository.port';
import {
  BARBERSHOP_REPOSITORY,
  BarbershopRepository,
} from '../../usecases/ports/barbershop.repository.port';
import {
  BARBER_REPOSITORY,
  BarberRepository,
} from '../../usecases/ports/barber.repository.port';
import {
  BOOKING_RULES_REPOSITORY,
  BookingRulesRepository,
} from '../../usecases/ports/booking-rules.repository.port';
import { Clock, CLOCK } from '../../usecases/ports/clock.port';
import {
  NO_SHOW_LEDGER,
  NoShowLedger,
} from '../../usecases/ports/no-show-ledger.port';
import {
  SCHEDULE_QUERY,
  ScheduleQuery,
} from '../../usecases/ports/schedule.query.port';
import { ResetExpiredNoShowsUseCase } from '../../usecases/reset-expired-no-shows/reset-expired-no-shows.use-case';
import { BarberAccessPolicy } from '../../usecases/shared/barber-access-policy';
import { TypeOrmNoShowLedger } from '../database/repositories/typeorm-no-show-ledger';
import { NoShowResetJob } from '../jobs/no-show-reset.job';
import { SystemClock } from '../security/system-clock';
import { AccountModule } from './account.module';
import { BarbersModule } from './barbers.module';
import { BookingRulesModule } from './booking-rules.module';
import { ScheduleModule } from './schedule.module';
import { SchedulingModule } from './scheduling.module';

// US-11: attendance, no-show counter, self-booking block and the daily reset.
// The route lives in the AppointmentsController, whose module imports this one.
@Module({
  imports: [
    AccountModule,
    BarbersModule,
    BookingRulesModule,
    SchedulingModule,
    ScheduleModule,
  ],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: NO_SHOW_LEDGER,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmNoShowLedger(dataSource),
    },
    {
      provide: MarkAttendanceUseCase,
      inject: [
        APPOINTMENT_REPOSITORY,
        BARBER_REPOSITORY,
        NO_SHOW_LEDGER,
        BOOKING_RULES_REPOSITORY,
        SCHEDULE_QUERY,
        CLOCK,
      ],
      useFactory: (
        appointments: AppointmentRepository,
        barbers: BarberRepository,
        ledger: NoShowLedger,
        bookingRules: BookingRulesRepository,
        schedule: ScheduleQuery,
        clock: Clock,
      ) =>
        new MarkAttendanceUseCase(
          appointments,
          new BarberAccessPolicy(barbers),
          ledger,
          bookingRules,
          schedule,
          clock,
        ),
    },
    {
      provide: ResetExpiredNoShowsUseCase,
      inject: [BARBERSHOP_REPOSITORY, NO_SHOW_LEDGER, CLOCK],
      useFactory: (
        barbershops: BarbershopRepository,
        ledger: NoShowLedger,
        clock: Clock,
      ) => new ResetExpiredNoShowsUseCase(barbershops, ledger, clock),
    },
    NoShowResetJob,
  ],
  exports: [MarkAttendanceUseCase],
})
export class AttendanceModule {}

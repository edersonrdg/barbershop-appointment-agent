import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ClientsController } from '../../interface-adapters/controllers/clients.controller';
import { GetClientProfileUseCase } from '../../usecases/get-client-profile/get-client-profile.use-case';
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
import {
  CLIENT_REPOSITORY,
  ClientRepository,
} from '../../usecases/ports/client.repository.port';
import { Clock, CLOCK } from '../../usecases/ports/clock.port';
import {
  NO_SHOW_LEDGER,
  NoShowLedger,
} from '../../usecases/ports/no-show-ledger.port';
import {
  SCHEDULE_QUERY,
  ScheduleQuery,
} from '../../usecases/ports/schedule.query.port';
import { SearchClientsUseCase } from '../../usecases/search-clients/search-clients.use-case';
import { UnblockClientUseCase } from '../../usecases/unblock-client/unblock-client.use-case';
import { TypeOrmClientRepository } from '../database/repositories/typeorm-client.repository';
import { SystemClock } from '../security/system-clock';
import { AccountModule } from './account.module';
import { AttendanceModule } from './attendance.module';
import { BarbersModule } from './barbers.module';
import { BookingRulesModule } from './booking-rules.module';
import { ScheduleModule } from './schedule.module';

// US-12 and US-22: client search, profile and unblocking in the panel.
@Module({
  imports: [
    AccountModule,
    AttendanceModule,
    BarbersModule,
    BookingRulesModule,
    ScheduleModule,
  ],
  controllers: [ClientsController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: CLIENT_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmClientRepository(dataSource),
    },
    {
      provide: SearchClientsUseCase,
      inject: [BARBER_REPOSITORY, CLIENT_REPOSITORY],
      useFactory: (barbers: BarberRepository, clients: ClientRepository) =>
        new SearchClientsUseCase(barbers, clients),
    },
    {
      provide: GetClientProfileUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        BARBER_REPOSITORY,
        CLIENT_REPOSITORY,
        SCHEDULE_QUERY,
        NO_SHOW_LEDGER,
        BOOKING_RULES_REPOSITORY,
        CLOCK,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        barbers: BarberRepository,
        clients: ClientRepository,
        schedule: ScheduleQuery,
        ledger: NoShowLedger,
        bookingRules: BookingRulesRepository,
        clock: Clock,
      ) =>
        new GetClientProfileUseCase(
          barbershops,
          barbers,
          clients,
          schedule,
          ledger,
          bookingRules,
          clock,
        ),
    },
    {
      provide: UnblockClientUseCase,
      inject: [
        CLIENT_REPOSITORY,
        NO_SHOW_LEDGER,
        BOOKING_RULES_REPOSITORY,
        CLOCK,
      ],
      useFactory: (
        clients: ClientRepository,
        ledger: NoShowLedger,
        bookingRules: BookingRulesRepository,
        clock: Clock,
      ) => new UnblockClientUseCase(clients, ledger, bookingRules, clock),
    },
  ],
})
export class ClientsModule {}

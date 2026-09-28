import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppointmentsController } from '../../interface-adapters/controllers/appointments.controller';
import { BookAppointmentUseCase } from '../../usecases/book-appointment/book-appointment.use-case';
import { CreateManualAppointmentUseCase } from '../../usecases/create-manual-appointment/create-manual-appointment.use-case';
import { ListAvailableSlotsUseCase } from '../../usecases/list-available-slots/list-available-slots.use-case';
import { ListPanelSlotsUseCase } from '../../usecases/list-panel-slots/list-panel-slots.use-case';
import {
  BARBER_REPOSITORY,
  BarberRepository,
} from '../../usecases/ports/barber.repository.port';
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
  ID_GENERATOR,
  IdGenerator,
} from '../../usecases/ports/id-generator.port';
import {
  SCHEDULE_QUERY,
  ScheduleQuery,
} from '../../usecases/ports/schedule.query.port';
import { BarberAccessPolicy } from '../../usecases/shared/barber-access-policy';
import { TypeOrmClientRepository } from '../database/repositories/typeorm-client.repository';
import { SystemClock } from '../security/system-clock';
import { UuidIdGenerator } from '../security/uuid-id-generator';
import { AccountModule } from './account.module';
import { BarbersModule } from './barbers.module';
import { ScheduleModule } from './schedule.module';
import { SchedulingModule } from './scheduling.module';

// US-10: manual booking in the panel, through the engine of US-07.
@Module({
  imports: [AccountModule, BarbersModule, SchedulingModule, ScheduleModule],
  controllers: [AppointmentsController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidIdGenerator },
    {
      provide: CLIENT_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmClientRepository(dataSource),
    },
    {
      provide: BarberAccessPolicy,
      inject: [BARBER_REPOSITORY],
      useFactory: (barbers: BarberRepository) =>
        new BarberAccessPolicy(barbers),
    },
    {
      provide: CreateManualAppointmentUseCase,
      inject: [
        BarberAccessPolicy,
        CLIENT_REPOSITORY,
        BookAppointmentUseCase,
        SCHEDULE_QUERY,
        ID_GENERATOR,
        CLOCK,
      ],
      useFactory: (
        access: BarberAccessPolicy,
        clients: ClientRepository,
        book: BookAppointmentUseCase,
        schedule: ScheduleQuery,
        ids: IdGenerator,
        clock: Clock,
      ) =>
        new CreateManualAppointmentUseCase(
          access,
          clients,
          book,
          schedule,
          ids,
          clock,
        ),
    },
    {
      provide: ListPanelSlotsUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        BarberAccessPolicy,
        ListAvailableSlotsUseCase,
        BARBER_REPOSITORY,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        access: BarberAccessPolicy,
        listSlots: ListAvailableSlotsUseCase,
        barbers: BarberRepository,
      ) => new ListPanelSlotsUseCase(barbershops, access, listSlots, barbers),
    },
  ],
})
export class ManualBookingModule {}

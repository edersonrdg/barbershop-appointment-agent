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
  SCHEDULE_QUERY,
  ScheduleQuery,
} from '../../usecases/ports/schedule.query.port';
import { TypeOrmScheduleQuery } from '../database/repositories/typeorm-schedule.query';
import { AccountModule } from './account.module';
import { BarbersModule } from './barbers.module';

// US-08: reading the schedule in the panel.
@Module({
  imports: [AccountModule, BarbersModule],
  controllers: [ScheduleController],
  providers: [
    {
      provide: SCHEDULE_QUERY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmScheduleQuery(dataSource),
    },
    {
      provide: ListScheduleUseCase,
      inject: [BARBERSHOP_REPOSITORY, BARBER_REPOSITORY, SCHEDULE_QUERY],
      useFactory: (
        barbershops: BarbershopRepository,
        barbers: BarberRepository,
        schedule: ScheduleQuery,
      ) => new ListScheduleUseCase(barbershops, barbers, schedule),
    },
  ],
  exports: [SCHEDULE_QUERY],
})
export class ScheduleModule {}

import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReportsController } from '../../interface-adapters/controllers/reports.controller';
import { GetBarbershopReportUseCase } from '../../usecases/get-barbershop-report/get-barbershop-report.use-case';
import {
  REPORT_QUERY,
  ReportQuery,
} from '../../usecases/get-barbershop-report/report.query.port';
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
import { TypeOrmReportQuery } from '../database/repositories/typeorm-report.query';
import { AccountModule } from './account.module';
import { BarbersModule } from './barbers.module';
import { SchedulingModule } from './scheduling.module';

// US-26: the owner's reports, over the same available time as US-07.
@Module({
  imports: [AccountModule, BarbersModule, SchedulingModule],
  controllers: [ReportsController],
  providers: [
    {
      provide: REPORT_QUERY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmReportQuery(dataSource),
    },
    {
      provide: GetBarbershopReportUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        BARBER_REPOSITORY,
        APPOINTMENT_REPOSITORY,
        BARBER_BLOCK_REPOSITORY,
        REPORT_QUERY,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        barbers: BarberRepository,
        appointments: AppointmentRepository,
        blocks: BarberBlockRepository,
        reports: ReportQuery,
      ) =>
        new GetBarbershopReportUseCase(
          barbershops,
          barbers,
          appointments,
          blocks,
          reports,
        ),
    },
  ],
})
export class ReportsModule {}

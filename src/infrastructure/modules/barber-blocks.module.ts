import { Module } from '@nestjs/common';
import { BarberBlocksController } from '../../interface-adapters/controllers/barber-blocks.controller';
import { CreateBarberBlockUseCase } from '../../usecases/create-barber-block/create-barber-block.use-case';
import { ListBarberBlocksUseCase } from '../../usecases/list-barber-blocks/list-barber-blocks.use-case';
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
import { Clock, CLOCK } from '../../usecases/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../usecases/ports/id-generator.port';
import {
  SCHEDULE_QUERY,
  ScheduleQuery,
} from '../../usecases/ports/schedule.query.port';
import { RemoveBarberBlockUseCase } from '../../usecases/remove-barber-block/remove-barber-block.use-case';
import { BarberAccessPolicy } from '../../usecases/shared/barber-access-policy';
import { SystemClock } from '../security/system-clock';
import { UuidIdGenerator } from '../security/uuid-id-generator';
import { AccountModule } from './account.module';
import { BarbersModule } from './barbers.module';
import { ScheduleModule } from './schedule.module';
import { SchedulingModule } from './scheduling.module';

// US-09: blocks and days off, written to the table the engine (US-07) reads.
@Module({
  imports: [AccountModule, BarbersModule, SchedulingModule, ScheduleModule],
  controllers: [BarberBlocksController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidIdGenerator },
    {
      provide: BarberAccessPolicy,
      inject: [BARBER_REPOSITORY],
      useFactory: (barbers: BarberRepository) =>
        new BarberAccessPolicy(barbers),
    },
    {
      provide: CreateBarberBlockUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        BarberAccessPolicy,
        SCHEDULE_QUERY,
        BARBER_BLOCK_REPOSITORY,
        CLOCK,
        ID_GENERATOR,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        access: BarberAccessPolicy,
        schedule: ScheduleQuery,
        blocks: BarberBlockRepository,
        clock: Clock,
        ids: IdGenerator,
      ) =>
        new CreateBarberBlockUseCase(
          barbershops,
          access,
          schedule,
          blocks,
          clock,
          ids,
        ),
    },
    {
      provide: ListBarberBlocksUseCase,
      inject: [
        BARBERSHOP_REPOSITORY,
        BarberAccessPolicy,
        BARBER_BLOCK_REPOSITORY,
      ],
      useFactory: (
        barbershops: BarbershopRepository,
        access: BarberAccessPolicy,
        blocks: BarberBlockRepository,
      ) => new ListBarberBlocksUseCase(barbershops, access, blocks),
    },
    {
      provide: RemoveBarberBlockUseCase,
      inject: [BarberAccessPolicy, BARBER_BLOCK_REPOSITORY],
      useFactory: (access: BarberAccessPolicy, blocks: BarberBlockRepository) =>
        new RemoveBarberBlockUseCase(access, blocks),
    },
  ],
})
export class BarberBlocksModule {}

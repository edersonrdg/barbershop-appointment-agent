import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BarbersController } from '../../interface-adapters/controllers/barbers.controller';
import { CreateBarberUseCase } from '../../usecases/create-barber/create-barber.use-case';
import { FindBarberByUserUseCase } from '../../usecases/find-barber-by-user/find-barber-by-user.use-case';
import { ListBarbersUseCase } from '../../usecases/list-barbers/list-barbers.use-case';
import { ListSchedulableBarbersUseCase } from '../../usecases/list-schedulable-barbers/list-schedulable-barbers.use-case';
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
  SERVICE_REPOSITORY,
  ServiceRepository,
} from '../../usecases/ports/service.repository.port';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../usecases/ports/user.repository.port';
import { UpdateBarberUseCase } from '../../usecases/update-barber/update-barber.use-case';
import { TypeOrmBarberRepository } from '../database/repositories/typeorm-barber.repository';
import { SystemClock } from '../security/system-clock';
import { UuidIdGenerator } from '../security/uuid-id-generator';
import { AccountModule } from './account.module';
import { ServicesModule } from './services.module';

@Module({
  imports: [AccountModule, ServicesModule],
  controllers: [BarbersController],
  providers: [
    {
      provide: BARBER_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmBarberRepository(dataSource),
    },
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidIdGenerator },
    {
      provide: ListBarbersUseCase,
      inject: [BARBER_REPOSITORY],
      useFactory: (barbers: BarberRepository) =>
        new ListBarbersUseCase(barbers),
    },
    {
      provide: ListSchedulableBarbersUseCase,
      inject: [BARBER_REPOSITORY],
      useFactory: (barbers: BarberRepository) =>
        new ListSchedulableBarbersUseCase(barbers),
    },
    {
      provide: FindBarberByUserUseCase,
      inject: [BARBER_REPOSITORY],
      useFactory: (barbers: BarberRepository) =>
        new FindBarberByUserUseCase(barbers),
    },
    {
      provide: CreateBarberUseCase,
      inject: [
        BARBER_REPOSITORY,
        SERVICE_REPOSITORY,
        USER_REPOSITORY,
        BARBERSHOP_REPOSITORY,
        CLOCK,
        ID_GENERATOR,
      ],
      useFactory: (
        barbers: BarberRepository,
        services: ServiceRepository,
        users: UserRepository,
        barbershops: BarbershopRepository,
        clock: Clock,
        idGenerator: IdGenerator,
      ) =>
        new CreateBarberUseCase(
          barbers,
          services,
          users,
          barbershops,
          clock,
          idGenerator,
        ),
    },
    {
      provide: UpdateBarberUseCase,
      inject: [
        BARBER_REPOSITORY,
        SERVICE_REPOSITORY,
        USER_REPOSITORY,
        BARBERSHOP_REPOSITORY,
      ],
      useFactory: (
        barbers: BarberRepository,
        services: ServiceRepository,
        users: UserRepository,
        barbershops: BarbershopRepository,
      ) => new UpdateBarberUseCase(barbers, services, users, barbershops),
    },
  ],
  exports: [
    BARBER_REPOSITORY,
    ListSchedulableBarbersUseCase,
    FindBarberByUserUseCase,
  ],
})
export class BarbersModule {}

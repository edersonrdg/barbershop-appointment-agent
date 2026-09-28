import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ServicesController } from '../../interface-adapters/controllers/services.controller';
import { CreateServiceUseCase } from '../../usecases/create-service/create-service.use-case';
import { ListBookableServicesUseCase } from '../../usecases/list-bookable-services/list-bookable-services.use-case';
import { ListServicesUseCase } from '../../usecases/list-services/list-services.use-case';
import { Clock, CLOCK } from '../../usecases/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../usecases/ports/id-generator.port';
import {
  SERVICE_REPOSITORY,
  ServiceRepository,
} from '../../usecases/ports/service.repository.port';
import { UpdateServiceUseCase } from '../../usecases/update-service/update-service.use-case';
import { TypeOrmServiceRepository } from '../database/repositories/typeorm-service.repository';
import { SystemClock } from '../security/system-clock';
import { UuidIdGenerator } from '../security/uuid-id-generator';

@Module({
  controllers: [ServicesController],
  providers: [
    {
      provide: SERVICE_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmServiceRepository(dataSource),
    },
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidIdGenerator },
    {
      provide: ListServicesUseCase,
      inject: [SERVICE_REPOSITORY],
      useFactory: (services: ServiceRepository) =>
        new ListServicesUseCase(services),
    },
    {
      provide: ListBookableServicesUseCase,
      inject: [SERVICE_REPOSITORY],
      useFactory: (services: ServiceRepository) =>
        new ListBookableServicesUseCase(services),
    },
    {
      provide: CreateServiceUseCase,
      inject: [SERVICE_REPOSITORY, CLOCK, ID_GENERATOR],
      useFactory: (
        services: ServiceRepository,
        clock: Clock,
        idGenerator: IdGenerator,
      ) => new CreateServiceUseCase(services, clock, idGenerator),
    },
    {
      provide: UpdateServiceUseCase,
      inject: [SERVICE_REPOSITORY],
      useFactory: (services: ServiceRepository) =>
        new UpdateServiceUseCase(services),
    },
  ],
  exports: [SERVICE_REPOSITORY, ListBookableServicesUseCase],
})
export class ServicesModule {}

import { Module } from '@nestjs/common';
import { BarbershopSettingsController } from '../../interface-adapters/controllers/barbershop-settings.controller';
import { GetBarbershopSettingsUseCase } from '../../usecases/get-barbershop-settings/get-barbershop-settings.use-case';
import {
  BARBERSHOP_REPOSITORY,
  BarbershopRepository,
} from '../../usecases/ports/barbershop.repository.port';
import { UpdateBarbershopSettingsUseCase } from '../../usecases/update-barbershop-settings/update-barbershop-settings.use-case';
import { AccountModule } from './account.module';

@Module({
  imports: [AccountModule],
  controllers: [BarbershopSettingsController],
  providers: [
    {
      provide: GetBarbershopSettingsUseCase,
      inject: [BARBERSHOP_REPOSITORY],
      useFactory: (barbershops: BarbershopRepository) =>
        new GetBarbershopSettingsUseCase(barbershops),
    },
    {
      provide: UpdateBarbershopSettingsUseCase,
      inject: [BARBERSHOP_REPOSITORY],
      useFactory: (barbershops: BarbershopRepository) =>
        new UpdateBarbershopSettingsUseCase(barbershops),
    },
  ],
})
export class BarbershopSettingsModule {}

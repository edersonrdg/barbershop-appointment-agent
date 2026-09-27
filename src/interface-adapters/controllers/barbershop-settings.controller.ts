import { Body, Controller, Get, Put } from '@nestjs/common';
import { GetBarbershopSettingsUseCase } from '../../usecases/get-barbershop-settings/get-barbershop-settings.use-case';
import { UpdateBarbershopSettingsUseCase } from '../../usecases/update-barbershop-settings/update-barbershop-settings.use-case';
import {
  BarbershopSettingsPresenter,
  BarbershopSettingsResponse,
} from '../presenters/barbershop-settings.presenter';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import type { BarbershopSettingsBody } from './schemas/barbershop-settings.schema';
import { barbershopSettingsSchema } from './schemas/barbershop-settings.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Owner only: no @Roles, so the session guard denies barbers (AD-007).
// RN-26: the tenant comes only from the session.
@Controller('settings/barbershop')
export class BarbershopSettingsController {
  constructor(
    private readonly getBarbershopSettings: GetBarbershopSettingsUseCase,
    private readonly updateBarbershopSettings: UpdateBarbershopSettingsUseCase,
  ) {}

  @Get()
  async show(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<BarbershopSettingsResponse> {
    return BarbershopSettingsPresenter.toResponse(
      await this.getBarbershopSettings.execute({
        barbershopId: session.barbershopId,
      }),
    );
  }

  @Put()
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Body(new ZodValidationPipe(barbershopSettingsSchema))
    body: BarbershopSettingsBody,
  ): Promise<BarbershopSettingsResponse> {
    return BarbershopSettingsPresenter.toResponse(
      await this.updateBarbershopSettings.execute({
        barbershopId: session.barbershopId,
        name: body.name,
        address: body.address,
        timezone: body.timezone,
        openingHours: body.openingHours,
      }),
    );
  }
}

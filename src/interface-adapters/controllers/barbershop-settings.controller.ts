import { Controller, Get } from '@nestjs/common';
import { GetBarbershopSettingsUseCase } from '../../usecases/get-barbershop-settings/get-barbershop-settings.use-case';
import {
  BarbershopSettingsPresenter,
  BarbershopSettingsResponse,
} from '../presenters/barbershop-settings.presenter';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';

// Owner only: no @Roles, so the session guard denies barbers (AD-007).
// RN-26: the tenant comes only from the session.
@Controller('settings/barbershop')
export class BarbershopSettingsController {
  constructor(
    private readonly getBarbershopSettings: GetBarbershopSettingsUseCase,
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
}

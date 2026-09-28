import { Body, Controller, Get, HttpStatus, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetBarbershopSettingsUseCase } from '../../usecases/get-barbershop-settings/get-barbershop-settings.use-case';
import { UpdateBarbershopSettingsUseCase } from '../../usecases/update-barbershop-settings/update-barbershop-settings.use-case';
import {
  BarbershopSettingsPresenter,
  BarbershopSettingsResponse,
  barbershopSettingsResponseSchema,
} from '../presenters/barbershop-settings.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import type { BarbershopSettingsBody } from './schemas/barbershop-settings.schema';
import { barbershopSettingsSchema } from './schemas/barbershop-settings.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Owner only: no @Roles, so the session guard denies barbers (AD-007).
// RN-26: the tenant comes only from the session.
@ApiTags('Configurações')
@Controller('settings/barbershop')
export class BarbershopSettingsController {
  constructor(
    private readonly getBarbershopSettings: GetBarbershopSettingsUseCase,
    private readonly updateBarbershopSettings: UpdateBarbershopSettingsUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Dados e horário de funcionamento da barbearia (US-03)',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Configurações atuais.',
    schema: barbershopSettingsResponseSchema,
  })
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
  @ApiOperation({
    summary: 'Atualiza dados e horário de funcionamento (US-03)',
    description:
      'Substitui tudo: os sete dias da semana são obrigatórios, com null para dia fechado.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Configurações salvas.',
    schema: barbershopSettingsResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Horário incoerente, como fechamento antes da abertura ou intervalo fora do expediente (RF-32).',
    'Segunda-feira: o horário de fechamento deve ser depois do de abertura.',
  )
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

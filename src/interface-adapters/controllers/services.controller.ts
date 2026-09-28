import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateServiceUseCase } from '../../usecases/create-service/create-service.use-case';
import { ListServicesUseCase } from '../../usecases/list-services/list-services.use-case';
import {
  ServiceListResponse,
  serviceListResponseSchema,
  ServicePresenter,
  ServiceResponse,
  serviceResponseSchema,
} from '../presenters/service.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import type { ServiceBody } from './schemas/service.schema';
import { serviceSchema } from './schemas/service.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Owner only: no @Roles, so the session guard denies barbers (AD-007).
// RN-26: the tenant comes only from the session.
@ApiTags('Configurações')
@Controller('settings/services')
export class ServicesController {
  constructor(
    private readonly listServices: ListServicesUseCase,
    private readonly createService: CreateServiceUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista os serviços da barbearia (US-04)',
    description:
      'Traz ativos e inativos, em ordem de nome sem diferenciar maiúsculas.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Serviços da barbearia da sessão.',
    schema: serviceListResponseSchema,
  })
  async list(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<ServiceListResponse> {
    return ServicePresenter.toListResponse(
      await this.listServices.execute({ barbershopId: session.barbershopId }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Cadastra um serviço (US-04)',
    description:
      'O serviço nasce ativo. Os adicionais precisam ser serviços ativos da mesma barbearia.',
  })
  @ApiZodResponse({
    status: HttpStatus.CREATED,
    description: 'Serviço cadastrado.',
    schema: serviceResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'A barbearia já tem um serviço, ativo ou inativo, com esse nome (sem diferenciar maiúsculas).',
    'Já existe um serviço com esse nome.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Adicional inexistente, de outra barbearia ou inativo (RF-33).',
    'Os serviços adicionais devem estar ativos.',
  )
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Body(new ZodValidationPipe(serviceSchema)) body: ServiceBody,
  ): Promise<ServiceResponse> {
    return ServicePresenter.toResponse(
      await this.createService.execute({
        barbershopId: session.barbershopId,
        name: body.name,
        priceCents: body.priceCents,
        durationMinutes: body.durationMinutes,
        suggestedAddOnIds: body.suggestedAddOnIds,
      }),
    );
  }
}

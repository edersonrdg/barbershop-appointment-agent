import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateServiceUseCase } from '../../usecases/create-service/create-service.use-case';
import { ListServicesUseCase } from '../../usecases/list-services/list-services.use-case';
import { SetServiceActiveUseCase } from '../../usecases/set-service-active/set-service-active.use-case';
import { UpdateServiceUseCase } from '../../usecases/update-service/update-service.use-case';
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
import type { ServiceIdParams } from './schemas/service-id.params.schema';
import { serviceIdParamsSchema } from './schemas/service-id.params.schema';
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
    private readonly updateService: UpdateServiceUseCase,
    private readonly setServiceActive: SetServiceActiveUseCase,
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

  @Put(':serviceId')
  @ApiOperation({
    summary: 'Edita um serviço (US-04)',
    description:
      'Substitui nome, preço, duração e a lista de adicionais; não muda o status ativo/inativo.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Serviço salvo.',
    schema: serviceResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Não há serviço com esse id nesta barbearia (RN-26).',
    'Serviço não encontrado.',
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Outro serviço da barbearia já tem esse nome (sem diferenciar maiúsculas).',
    'Já existe um serviço com esse nome.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Adicional inexistente, de outra barbearia, inativo ou o próprio serviço (RF-33).',
    'Um serviço não pode ser adicional de si mesmo.',
  )
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Param(new ZodValidationPipe(serviceIdParamsSchema))
    params: ServiceIdParams,
    @Body(new ZodValidationPipe(serviceSchema)) body: ServiceBody,
  ): Promise<ServiceResponse> {
    return ServicePresenter.toResponse(
      await this.updateService.execute({
        barbershopId: session.barbershopId,
        serviceId: params.serviceId,
        name: body.name,
        priceCents: body.priceCents,
        durationMinutes: body.durationMinutes,
        suggestedAddOnIds: body.suggestedAddOnIds,
      }),
    );
  }

  @Post(':serviceId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desativa um serviço (US-04)',
    description:
      'O serviço sai dos novos agendamentos e continua na lista com active: false. Desativar um inativo não muda nada.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Serviço inativo.',
    schema: serviceResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Não há serviço com esse id nesta barbearia (RN-26).',
    'Serviço não encontrado.',
  )
  async deactivate(
    @CurrentSession() session: AuthenticatedSession,
    @Param(new ZodValidationPipe(serviceIdParamsSchema))
    params: ServiceIdParams,
  ): Promise<ServiceResponse> {
    return ServicePresenter.toResponse(
      await this.setServiceActive.execute({
        barbershopId: session.barbershopId,
        serviceId: params.serviceId,
        active: false,
      }),
    );
  }

  @Post(':serviceId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reativa um serviço (US-04)',
    description:
      'O serviço volta a ser oferecido em novos agendamentos. Ativar um ativo não muda nada.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Serviço ativo.',
    schema: serviceResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Não há serviço com esse id nesta barbearia (RN-26).',
    'Serviço não encontrado.',
  )
  async activate(
    @CurrentSession() session: AuthenticatedSession,
    @Param(new ZodValidationPipe(serviceIdParamsSchema))
    params: ServiceIdParams,
  ): Promise<ServiceResponse> {
    return ServicePresenter.toResponse(
      await this.setServiceActive.execute({
        barbershopId: session.barbershopId,
        serviceId: params.serviceId,
        active: true,
      }),
    );
  }
}

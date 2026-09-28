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
import { CreateBarberUseCase } from '../../usecases/create-barber/create-barber.use-case';
import { ListBarbersUseCase } from '../../usecases/list-barbers/list-barbers.use-case';
import { UpdateBarberUseCase } from '../../usecases/update-barber/update-barber.use-case';
import {
  BarberListResponse,
  barberListResponseSchema,
  BarberPresenter,
  SavedBarberResponse,
  savedBarberResponseSchema,
} from '../presenters/barber.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import type { BarberIdParams } from './schemas/barber-id.params.schema';
import { barberIdParamsSchema } from './schemas/barber-id.params.schema';
import type { BarberBody } from './schemas/barber.schema';
import { barberSchema } from './schemas/barber.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Owner only: no @Roles, so the session guard denies barbers (AD-007).
// RN-26: the tenant comes only from the session.
@ApiTags('Configurações')
@Controller('settings/barbers')
export class BarbersController {
  constructor(
    private readonly listBarbers: ListBarbersUseCase,
    private readonly createBarber: CreateBarberUseCase,
    private readonly updateBarber: UpdateBarberUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista os barbeiros da barbearia (US-05)',
    description:
      'Traz ativos e inativos, com serviços e jornada, em ordem de nome sem diferenciar maiúsculas.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Barbeiros da barbearia da sessão.',
    schema: barberListResponseSchema,
  })
  async list(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<BarberListResponse> {
    return BarberPresenter.toListResponse(
      await this.listBarbers.execute({ barbershopId: session.barbershopId }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Cadastra um barbeiro com serviços e jornada (US-05)',
    description:
      'O barbeiro nasce ativo. Os serviços precisam estar ativos na mesma barbearia; o usuário vinculado (opcional) precisa ser da mesma barbearia. Se a jornada sair do horário de funcionamento, o barbeiro é salvo e a resposta traz os avisos em warnings.',
  })
  @ApiZodResponse({
    status: HttpStatus.CREATED,
    description: 'Barbeiro cadastrado, com os avisos de jornada (CA-05.3).',
    schema: savedBarberResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Nome já usado por outro barbeiro da barbearia (sem diferenciar maiúsculas), ou usuário já vinculado a outro barbeiro.',
    'Esse usuário já está vinculado a outro barbeiro.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Serviço inexistente, de outra barbearia ou inativo; usuário inexistente ou de outra barbearia; jornada com fim antes do início ou intervalo fora da jornada.',
    'Os serviços realizados devem estar ativos.',
  )
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Body(new ZodValidationPipe(barberSchema)) body: BarberBody,
  ): Promise<SavedBarberResponse> {
    const { barber, warnings } = await this.createBarber.execute({
      barbershopId: session.barbershopId,
      name: body.name,
      userId: body.userId,
      serviceIds: body.serviceIds,
      workingHours: body.workingHours,
    });
    return BarberPresenter.toSavedResponse(barber, warnings);
  }

  @Put(':barberId')
  @ApiOperation({
    summary: 'Edita um barbeiro (US-05)',
    description:
      'Substitui nome, usuário vinculado (null desvincula), serviços e os 7 dias da jornada; não muda o status ativo/inativo. A resposta traz os avisos de jornada, como no cadastro.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Barbeiro salvo, com os avisos de jornada (CA-05.3).',
    schema: savedBarberResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Não há barbeiro com esse id nesta barbearia (RN-26).',
    'Barbeiro não encontrado.',
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Nome já usado por outro barbeiro da barbearia (sem diferenciar maiúsculas), ou usuário já vinculado a outro barbeiro.',
    'Já existe um barbeiro com esse nome.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Serviço inexistente, de outra barbearia ou inativo; usuário inexistente ou de outra barbearia; jornada com fim antes do início ou intervalo fora da jornada.',
    'Usuário não encontrado.',
  )
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Param(new ZodValidationPipe(barberIdParamsSchema)) params: BarberIdParams,
    @Body(new ZodValidationPipe(barberSchema)) body: BarberBody,
  ): Promise<SavedBarberResponse> {
    const { barber, warnings } = await this.updateBarber.execute({
      barbershopId: session.barbershopId,
      barberId: params.barberId,
      name: body.name,
      userId: body.userId,
      serviceIds: body.serviceIds,
      workingHours: body.workingHours,
    });
    return BarberPresenter.toSavedResponse(barber, warnings);
  }
}

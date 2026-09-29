import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetClientProfileUseCase } from '../../usecases/get-client-profile/get-client-profile.use-case';
import { SearchClientsUseCase } from '../../usecases/search-clients/search-clients.use-case';
import {
  ClientListResponse,
  clientListResponseSchema,
  ClientPresenter,
  ClientProfileResponse,
  clientProfileResponseSchema,
} from '../presenters/client.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import { Roles } from './roles.decorator';
import type { ClientIdParams } from './schemas/client-id.params.schema';
import { clientIdParamsSchema } from './schemas/client-id.params.schema';
import type { ClientSearchQueryParams } from './schemas/client-search.query.schema';
import { clientSearchQuerySchema } from './schemas/client-search.query.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Open to barbers; the use cases limit them to the clients and appointments of
// their own barber (CA-12.3). RN-26: the tenant comes only from the session.
@ApiTags('Clientes')
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly searchClients: SearchClientsUseCase,
    private readonly getClientProfile: GetClientProfileUseCase,
  ) {}

  @Get()
  @Roles('owner', 'barber')
  @ApiOperation({
    summary: 'Busca clientes por nome ou telefone (US-12)',
    description:
      'Busca por parte do nome, sem diferenciar maiúsculas nem tratar % e _ como curinga, ou por 4 ou mais dígitos do telefone. Sem o termo, lista os clientes. O Barbeiro só encontra clientes com algum agendamento dele; sem ficha de barbeiro, recebe a lista vazia.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Clientes encontrados, no máximo 50.',
    schema: clientListResponseSchema,
  })
  async search(
    @CurrentSession() session: AuthenticatedSession,
    @Query(new ZodValidationPipe(clientSearchQuerySchema))
    query: ClientSearchQueryParams,
  ): Promise<ClientListResponse> {
    return ClientPresenter.toList(
      await this.searchClients.execute({
        barbershopId: session.barbershopId,
        userId: session.userId,
        role: session.role,
        q: query.q,
      }),
    );
  }

  @Get(':id')
  @Roles('owner', 'barber')
  @ApiOperation({
    summary: 'Perfil e histórico do cliente (US-12)',
    description:
      'Atendimentos passados, próximos agendamentos, faltas, bloqueio, serviços mais usados e lembrete de retorno. O Barbeiro vê só os agendamentos dele; faltas e bloqueio contam todos os barbeiros. Cliente sem agendamento com o Barbeiro responde como inexistente.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Perfil do cliente.',
    schema: clientProfileResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Não há cliente com esse id nesta barbearia (RN-26), ou o Barbeiro não tem agendamento com ele.',
    'Cliente não encontrado.',
  )
  async profile(
    @CurrentSession() session: AuthenticatedSession,
    @Param(new ZodValidationPipe(clientIdParamsSchema)) params: ClientIdParams,
  ): Promise<ClientProfileResponse> {
    return ClientPresenter.toProfile(
      await this.getClientProfile.execute({
        barbershopId: session.barbershopId,
        userId: session.userId,
        role: session.role,
        clientId: params.id,
      }),
    );
  }
}

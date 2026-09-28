import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListScheduleUseCase } from '../../usecases/list-schedule/list-schedule.use-case';
import {
  SchedulePresenter,
  ScheduleResponse,
  scheduleResponseSchema,
} from '../presenters/schedule.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import { Roles } from './roles.decorator';
import type { ScheduleQueryParams } from './schemas/schedule.query.schema';
import { scheduleQuerySchema } from './schemas/schedule.query.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Open to barbers; the use case limits them to their own schedule (CA-08.2).
// RN-26: the tenant comes only from the session.
@ApiTags('Agenda')
@Controller('appointments')
export class ScheduleController {
  constructor(private readonly listSchedule: ListScheduleUseCase) {}

  @Get()
  @Roles('owner', 'barber')
  @ApiOperation({
    summary: 'Agenda do dia ou da semana (US-08)',
    description:
      'O Dono vê todos os barbeiros e pode filtrar por um. O Barbeiro vê só os próprios agendamentos; sem ficha de barbeiro, recebe a lista vazia. A semana vai de segunda a domingo no fuso da barbearia, e entra o agendamento que começa no período.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Agendamentos do período.',
    schema: scheduleResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Barbeiro pedindo a agenda de outro barbeiro.',
    'Acesso negado.',
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Barbeiro do filtro não existe na barbearia.',
    'Barbeiro não encontrado.',
  )
  async list(
    @CurrentSession() session: AuthenticatedSession,
    @Query(new ZodValidationPipe(scheduleQuerySchema))
    query: ScheduleQueryParams,
  ): Promise<ScheduleResponse> {
    return SchedulePresenter.toResponse(
      await this.listSchedule.execute({
        barbershopId: session.barbershopId,
        userId: session.userId,
        role: session.role,
        ...query,
      }),
    );
  }
}

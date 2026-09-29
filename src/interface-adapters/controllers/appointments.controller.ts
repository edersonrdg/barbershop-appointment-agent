import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateManualAppointmentUseCase } from '../../usecases/create-manual-appointment/create-manual-appointment.use-case';
import { ListPanelSlotsUseCase } from '../../usecases/list-panel-slots/list-panel-slots.use-case';
import {
  AvailableSlotsPresenter,
  AvailableSlotsResponse,
  availableSlotsResponseSchema,
} from '../presenters/available-slots.presenter';
import {
  ScheduleAppointmentResponse,
  scheduleAppointmentSchema,
  SchedulePresenter,
} from '../presenters/schedule.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import { Roles } from './roles.decorator';
import type { AvailableSlotsQueryParams } from './schemas/available-slots.query.schema';
import { availableSlotsQuerySchema } from './schemas/available-slots.query.schema';
import type { CreateAppointmentBody } from './schemas/create-appointment.schema';
import { createAppointmentSchema } from './schemas/create-appointment.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Open to barbers; the use cases limit them to their own barber (CA-10.5).
// RN-26: the tenant comes only from the session.
@ApiTags('Agenda')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly createAppointment: CreateManualAppointmentUseCase,
    private readonly listSlots: ListPanelSlotsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('owner', 'barber')
  @ApiOperation({
    summary: 'Cria um agendamento manual pelo painel (US-10)',
    description:
      'Grava o agendamento com status confirmed e origem manual pelo mesmo motor do bot, sem a antecedência mínima. O telefone identifica o cliente: um telefone novo cria o cliente junto com o agendamento; um já cadastrado liga ao cliente existente e mantém o nome gravado. O Dono agenda para qualquer barbeiro ativo; o Barbeiro, só para si. Toda recusa diz a regra violada e nada é gravado.',
  })
  @ApiZodResponse({
    status: HttpStatus.CREATED,
    description: 'Agendamento gravado, no formato do item da agenda.',
    schema: scheduleAppointmentSchema,
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'O barbeiro não realiza todos os serviços escolhidos.',
    'O barbeiro não realiza todos os serviços escolhidos.',
  )
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Barbeiro agendando para outro barbeiro, ou sem ficha de barbeiro.',
    'Acesso negado.',
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Barbeiro inexistente ou inativo na barbearia ("Barbeiro não encontrado."), ou serviço inexistente ou inativo ("Serviço não encontrado.").',
    'Barbeiro não encontrado.',
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'O barbeiro já tem um agendamento confirmado que se sobrepõe ao horário (RN-03, RN-07).',
    'O barbeiro já tem um agendamento nesse horário.',
  )
  @ApiErrorResponse(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'Horário fora do funcionamento ("O horário está fora do funcionamento da barbearia."), fora da jornada ("O horário está fora da jornada do barbeiro."), sobre bloqueio ou folga ("O barbeiro está indisponível nesse horário.") (RN-05), ou já passado ("O horário já passou.").',
    'O horário está fora do funcionamento da barbearia.',
  )
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Body(new ZodValidationPipe(createAppointmentSchema))
    body: CreateAppointmentBody,
  ): Promise<ScheduleAppointmentResponse> {
    return SchedulePresenter.toAppointment(
      await this.createAppointment.execute({
        barbershopId: session.barbershopId,
        userId: session.userId,
        role: session.role,
        ...body,
      }),
    );
  }

  @Get('available-slots')
  @Roles('owner', 'barber')
  @ApiOperation({
    summary: 'Horários livres de um dia para os serviços escolhidos (US-10)',
    description:
      'Inícios livres calculados pelo motor para o painel: a partir de agora, sem a antecedência mínima. Com barberId, os horários desse barbeiro; sem ele, o Dono vê cada início uma vez com o primeiro barbeiro livre por nome, e o Barbeiro vê a própria agenda. Cada início devolvido pode ser enviado em POST /appointments.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Inícios livres do dia.',
    schema: availableSlotsResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'O barbeiro não realiza todos os serviços escolhidos.',
    'O barbeiro não realiza todos os serviços escolhidos.',
  )
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Barbeiro consultando outro barbeiro, ou sem ficha de barbeiro.',
    'Acesso negado.',
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Barbeiro inexistente ou inativo na barbearia ("Barbeiro não encontrado."), ou serviço inexistente ou inativo ("Serviço não encontrado.").',
    'Barbeiro não encontrado.',
  )
  async availableSlots(
    @CurrentSession() session: AuthenticatedSession,
    @Query(new ZodValidationPipe(availableSlotsQuerySchema))
    query: AvailableSlotsQueryParams,
  ): Promise<AvailableSlotsResponse> {
    return AvailableSlotsPresenter.toResponse(
      await this.listSlots.execute({
        barbershopId: session.barbershopId,
        userId: session.userId,
        role: session.role,
        ...query,
      }),
    );
  }
}

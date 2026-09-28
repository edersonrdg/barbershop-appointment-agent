import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BarberBlockConflictError } from '../../usecases/create-barber-block/barber-block-conflict.error';
import {
  CreateBarberBlockUseCase,
  CreatedBarberBlock,
} from '../../usecases/create-barber-block/create-barber-block.use-case';
import { ListBarberBlocksUseCase } from '../../usecases/list-barber-blocks/list-barber-blocks.use-case';
import { RemoveBarberBlockUseCase } from '../../usecases/remove-barber-block/remove-barber-block.use-case';
import {
  barberBlockConflictResponseSchema,
  BarberBlockListResponse,
  barberBlockListResponseSchema,
  BarberBlockPresenter,
  CreateBarberBlockResponse,
  createBarberBlockResponseSchema,
} from '../presenters/barber-block.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import { Roles } from './roles.decorator';
import type { CreateBarberBlockBody } from './schemas/barber-block.schema';
import { createBarberBlockSchema } from './schemas/barber-block.schema';
import type { BlockIdParams } from './schemas/block-id.params.schema';
import { blockIdParamsSchema } from './schemas/block-id.params.schema';
import type { ScheduleQueryParams } from './schemas/schedule.query.schema';
import { scheduleQuerySchema } from './schemas/schedule.query.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Open to barbers; the use cases limit them to their own barber (section 5).
// RN-26: the tenant comes only from the session.
@ApiTags('Bloqueios')
@Controller('blocks')
export class BarberBlocksController {
  constructor(
    private readonly createBlock: CreateBarberBlockUseCase,
    private readonly listBlocks: ListBarberBlocksUseCase,
    private readonly removeBlock: RemoveBarberBlockUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('owner', 'barber')
  @ApiOperation({
    summary: 'Cria um bloqueio de horário ou uma folga (US-09)',
    description:
      'block bloqueia de start a end na data; day_off bloqueia o dia inteiro, no fuso da barbearia. O Dono bloqueia qualquer barbeiro; o Barbeiro, só o próprio. Se o período atinge agendamentos confirmados, responde 409 com a lista e não grava; com confirmConflicts: true, grava e devolve a lista em affectedAppointments. Nenhum agendamento é cancelado (CA-09.3).',
  })
  @ApiZodResponse({
    status: HttpStatus.CREATED,
    description: 'Bloqueio gravado, com os agendamentos que ele atinge.',
    schema: createBarberBlockResponseSchema,
  })
  @ApiZodResponse({
    status: HttpStatus.CONFLICT,
    description:
      'O bloqueio atinge agendamentos confirmados e confirmConflicts não é true; nada foi gravado.',
    schema: barberBlockConflictResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Barbeiro bloqueando outro barbeiro, ou sem ficha de barbeiro.',
    'Acesso negado.',
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Barbeiro não existe na barbearia.',
    'Barbeiro não encontrado.',
  )
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Body(new ZodValidationPipe(createBarberBlockSchema))
    body: CreateBarberBlockBody,
  ): Promise<CreateBarberBlockResponse> {
    let created: CreatedBarberBlock;
    try {
      created = await this.createBlock.execute({
        barbershopId: session.barbershopId,
        userId: session.userId,
        role: session.role,
        ...body,
      });
    } catch (error) {
      // The global filter answers only { message }; the 409 of CA-09.3 also
      // carries the appointments the user has to see before confirming.
      if (error instanceof BarberBlockConflictError) {
        throw new ConflictException(BarberBlockPresenter.toConflict(error));
      }
      throw error;
    }
    return BarberBlockPresenter.toCreated(created);
  }

  @Get()
  @Roles('owner', 'barber')
  @ApiOperation({
    summary: 'Lista bloqueios e folgas do dia ou da semana (US-09)',
    description:
      'O Dono vê todos os barbeiros e pode filtrar por um. O Barbeiro vê só os próprios; sem ficha de barbeiro, recebe a lista vazia. A semana vai de segunda a domingo no fuso da barbearia, e entra o bloqueio que começa no período.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Bloqueios e folgas do período.',
    schema: barberBlockListResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Barbeiro pedindo os bloqueios de outro barbeiro.',
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
  ): Promise<BarberBlockListResponse> {
    return BarberBlockPresenter.toList(
      await this.listBlocks.execute({
        barbershopId: session.barbershopId,
        userId: session.userId,
        role: session.role,
        ...query,
      }),
    );
  }

  @Delete(':blockId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('owner', 'barber')
  @ApiOperation({
    summary: 'Remove um bloqueio ou uma folga (US-09)',
    description:
      'O Dono remove qualquer bloqueio da barbearia; o Barbeiro, só os próprios. Os horários que só ele impedia voltam a ser ofertados.',
  })
  @ApiZodResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Bloqueio removido.',
  })
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Barbeiro removendo bloqueio de outro barbeiro, ou sem ficha de barbeiro.',
    'Acesso negado.',
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Bloqueio não existe na barbearia.',
    'Bloqueio não encontrado.',
  )
  async remove(
    @CurrentSession() session: AuthenticatedSession,
    @Param(new ZodValidationPipe(blockIdParamsSchema)) params: BlockIdParams,
  ): Promise<void> {
    await this.removeBlock.execute({
      barbershopId: session.barbershopId,
      userId: session.userId,
      role: session.role,
      blockId: params.blockId,
    });
  }
}

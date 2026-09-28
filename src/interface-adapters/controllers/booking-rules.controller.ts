import { Body, Controller, Get, HttpStatus, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetBookingRulesUseCase } from '../../usecases/get-booking-rules/get-booking-rules.use-case';
import { UpdateBookingRulesUseCase } from '../../usecases/update-booking-rules/update-booking-rules.use-case';
import {
  BookingRulesPresenter,
  BookingRulesResponse,
  bookingRulesResponseSchema,
} from '../presenters/booking-rules.presenter';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import type { BookingRulesBody } from './schemas/booking-rules.schema';
import { bookingRulesSchema } from './schemas/booking-rules.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Owner only: no @Roles, so the session guard denies barbers (AD-007).
// RN-26: the tenant comes only from the session.
@ApiTags('Configurações')
@Controller('settings/rules')
export class BookingRulesController {
  constructor(
    private readonly getBookingRules: GetBookingRulesUseCase,
    private readonly updateBookingRules: UpdateBookingRulesUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Regras de agendamento da barbearia (US-06)' })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Regras vigentes.',
    schema: bookingRulesResponseSchema,
  })
  async show(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<BookingRulesResponse> {
    return BookingRulesPresenter.toResponse(
      await this.getBookingRules.execute({
        barbershopId: session.barbershopId,
      }),
    );
  }

  @Put()
  @ApiOperation({
    summary: 'Atualiza as regras de agendamento (US-06)',
    description:
      'Substitui as cinco regras; todas são obrigatórias. A nova regra vale para as próximas ações e não altera agendamentos já criados.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Regras salvas.',
    schema: bookingRulesResponseSchema,
  })
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Body(new ZodValidationPipe(bookingRulesSchema)) body: BookingRulesBody,
  ): Promise<BookingRulesResponse> {
    return BookingRulesPresenter.toResponse(
      await this.updateBookingRules.execute({
        barbershopId: session.barbershopId,
        ...body,
      }),
    );
  }
}

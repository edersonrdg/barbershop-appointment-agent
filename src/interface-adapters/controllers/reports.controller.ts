import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetBarbershopReportUseCase } from '../../usecases/get-barbershop-report/get-barbershop-report.use-case';
import {
  ReportPresenter,
  ReportResponse,
  reportResponseSchema,
} from '../presenters/report.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import type { ReportQueryParams } from './schemas/report.query.schema';
import { reportQuerySchema } from './schemas/report.query.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// CA-26.3: no @Roles, so only the owner reads reports (AD-007).
// RN-26: the tenant comes only from the session.
@ApiTags('Relatórios')
@Controller('reports')
export class ReportsController {
  constructor(private readonly getReport: GetBarbershopReportUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Relatório da barbearia no período (US-26)',
    description:
      'Total de agendamentos, cancelamentos, faltas, taxa de ocupação, receita estimada e % de agendamentos feitos pelo bot. Entra o agendamento que começa entre from e to, no fuso da barbearia. Com barberId, todos os números são só desse barbeiro.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Números do período.',
    schema: reportResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Barbeiro do filtro não existe na barbearia.',
    'Barbeiro não encontrado.',
  )
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Query(new ZodValidationPipe(reportQuerySchema))
    query: ReportQueryParams,
  ): Promise<ReportResponse> {
    return ReportPresenter.toResponse(
      await this.getReport.execute({
        barbershopId: session.barbershopId,
        ...query,
      }),
    );
  }
}

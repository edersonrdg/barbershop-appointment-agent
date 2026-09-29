import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  HealthIndicatorService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { z } from 'zod';
import { ApiZodResponse } from '../../interface-adapters/controllers/api-docs/api-zod-response.decorator';
import { Public } from '../../interface-adapters/controllers/public.decorator';
import { MESSAGE_INTERPRETER } from '../../usecases/ports/message-interpreter.port';
import type { MessageInterpreter } from '../../usecases/ports/message-interpreter.port';
import { WHATSAPP_CONNECTOR } from '../../usecases/ports/whatsapp-connector.port';
import type { WhatsAppConnector } from '../../usecases/ports/whatsapp-connector.port';

const indicatorsSchema = z.record(
  z.string(),
  z.looseObject({ status: z.enum(['up', 'down']) }),
);

const healthCheckResponseSchema = z.object({
  status: z.enum(['ok', 'error', 'shutting_down']),
  info: indicatorsSchema.optional(),
  error: indicatorsSchema.optional(),
  details: indicatorsSchema,
});

@ApiTags('Observabilidade')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly indicators: HealthIndicatorService,
    @Inject(WHATSAPP_CONNECTOR) private readonly whatsapp: WhatsAppConnector,
    @Inject(MESSAGE_INTERPRETER)
    private readonly interpreter: MessageInterpreter,
  ) {}

  @Get('live')
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness: o processo está no ar' })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Processo no ar.',
    schema: healthCheckResponseSchema,
  })
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary:
      'Readiness: dependências críticas (o banco, o conector de WhatsApp e o Gemini) respondem',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Todas as dependências estão de pé.',
    schema: healthCheckResponseSchema,
  })
  @ApiZodResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Alguma dependência está fora; `error` diz qual.',
    schema: healthCheckResponseSchema,
  })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.database.pingCheck('database', { timeout: 1500 }),
      () => this.whatsappCheck(),
      () => this.geminiCheck(),
    ]);
  }

  // US-15: the bot cannot answer without Gemini.
  private async geminiCheck(): Promise<HealthIndicatorResult> {
    const indicator = this.indicators.check('gemini');
    try {
      await this.interpreter.ping();
      return indicator.up();
    } catch {
      return indicator.down();
    }
  }

  // RNF-07: the WhatsApp connector is a critical integration (US-13).
  private async whatsappCheck(): Promise<HealthIndicatorResult> {
    const indicator = this.indicators.check('whatsapp');
    try {
      await this.whatsapp.ping();
      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}

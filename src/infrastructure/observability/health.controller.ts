import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { z } from 'zod';
import { ApiZodResponse } from '../../interface-adapters/controllers/api-docs/api-zod-response.decorator';
import { Public } from '../../interface-adapters/controllers/public.decorator';

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
    summary: 'Readiness: dependências críticas (hoje, o banco) respondem',
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
    ]);
  }
}

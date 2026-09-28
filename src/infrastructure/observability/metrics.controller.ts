import { Controller, Get, Header, Inject } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Registry } from 'prom-client';
import { Public } from '../../interface-adapters/controllers/public.decorator';
import { METRICS_REGISTRY } from './metrics.registry';

@ApiTags('Observabilidade')
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(METRICS_REGISTRY) private readonly registry: Registry) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Métricas no formato de texto do Prometheus' })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description: 'Métricas do Node e da aplicação.',
    schema: { type: 'string' },
  })
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

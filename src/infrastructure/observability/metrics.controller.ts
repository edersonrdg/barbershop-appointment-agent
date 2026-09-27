import { Controller, Get, Header, Inject } from '@nestjs/common';
import type { Registry } from 'prom-client';
import { Public } from '../../interface-adapters/controllers/public.decorator';
import { METRICS_REGISTRY } from './metrics.registry';

@Public()
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(METRICS_REGISTRY) private readonly registry: Registry) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

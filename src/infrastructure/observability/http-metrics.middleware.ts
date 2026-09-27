import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Histogram } from 'prom-client';
import { HTTP_REQUEST_DURATION } from './metrics.registry';

function routeLabel(req: Request): string {
  const route: unknown = req.route;
  if (typeof route !== 'object' || route === null || !('path' in route)) {
    // Sem rota casada (404): agrupa num único rótulo para não explodir a cardinalidade.
    return 'unmatched';
  }

  return `${req.baseUrl}${String(route.path)}`;
}

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(
    @Inject(HTTP_REQUEST_DURATION)
    private readonly httpRequestDuration: Histogram<
      'method' | 'route' | 'status_code'
    >,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const stopTimer = this.httpRequestDuration.startTimer();
    res.on('finish', () => {
      stopTimer({
        method: req.method,
        route: routeLabel(req),
        status_code: res.statusCode,
      });
    });
    next();
  }
}

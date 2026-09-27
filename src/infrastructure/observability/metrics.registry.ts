import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';

export const METRICS_REGISTRY = Symbol('METRICS_REGISTRY');
export const HTTP_REQUEST_DURATION = Symbol('HTTP_REQUEST_DURATION');

export function createMetricsRegistry(): Registry {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  return registry;
}

export function createHttpRequestDuration(
  registry: Registry,
): Histogram<'method' | 'route' | 'status_code'> {
  return new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP em segundos',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
}

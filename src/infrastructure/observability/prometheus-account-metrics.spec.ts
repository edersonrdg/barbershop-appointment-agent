import { Registry } from 'prom-client';
import { PrometheusAccountMetrics } from './prometheus-account-metrics';

describe('PrometheusAccountMetrics', () => {
  it('exposes barbershop_signups_total incremented once per signupCompleted() call', async () => {
    const registry = new Registry();
    const metrics = new PrometheusAccountMetrics(registry);

    metrics.signupCompleted();
    metrics.signupCompleted();

    const exposed = await registry.getSingleMetricAsString(
      'barbershop_signups_total',
    );

    expect(exposed).toContain('barbershop_signups_total 2');
  });
});

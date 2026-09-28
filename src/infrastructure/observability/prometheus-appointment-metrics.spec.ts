import { Registry } from 'prom-client';
import { PrometheusAppointmentMetrics } from './prometheus-appointment-metrics';

async function valuesOf(registry: Registry, name: string) {
  const metric = registry.getSingleMetric(name);
  if (!metric) throw new Error(`metric ${name} is not registered`);
  const { values } = await metric.get();
  return values.map(({ labels, value }) => ({ labels, value }));
}

describe('PrometheusAppointmentMetrics', () => {
  it('AVL-38: booked(origin) increments appointments_booked_total with the origin label', async () => {
    const registry = new Registry();
    const metrics = new PrometheusAppointmentMetrics(registry);

    metrics.booked('bot');

    expect(await valuesOf(registry, 'appointments_booked_total')).toEqual([
      { labels: { origin: 'bot' }, value: 1 },
    ]);
    expect(await valuesOf(registry, 'appointment_conflicts_total')).toEqual([]);
  });

  it('AVL-39: conflict(origin) increments appointment_conflicts_total with the origin label', async () => {
    const registry = new Registry();
    const metrics = new PrometheusAppointmentMetrics(registry);

    metrics.conflict('manual');

    expect(await valuesOf(registry, 'appointment_conflicts_total')).toEqual([
      { labels: { origin: 'manual' }, value: 1 },
    ]);
    expect(await valuesOf(registry, 'appointments_booked_total')).toEqual([]);
  });
});

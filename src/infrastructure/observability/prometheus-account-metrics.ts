import { Counter, Registry } from 'prom-client';
import { AccountMetrics } from '../../usecases/ports/account-metrics.port';

export class PrometheusAccountMetrics implements AccountMetrics {
  private readonly signupsTotal: Counter;

  constructor(registry: Registry) {
    this.signupsTotal = new Counter({
      name: 'barbershop_signups_total',
      help: 'Total de cadastros de barbearia concluídos',
      registers: [registry],
    });
  }

  signupCompleted(): void {
    this.signupsTotal.inc();
  }
}

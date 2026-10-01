import { Counter, Registry } from 'prom-client';
import { AppointmentOrigin } from '../../domain/entities/appointment';
import { AppointmentMetrics } from '../../usecases/ports/appointment-metrics.port';

export class PrometheusAppointmentMetrics implements AppointmentMetrics {
  private readonly bookedTotal: Counter<'origin'>;
  private readonly conflictsTotal: Counter<'origin'>;
  private readonly cancelledTotal: Counter<'origin'>;

  constructor(registry: Registry) {
    this.bookedTotal = new Counter({
      name: 'appointments_booked_total',
      help: 'Total de agendamentos gravados, por origem',
      labelNames: ['origin'],
      registers: [registry],
    });
    this.conflictsTotal = new Counter({
      name: 'appointment_conflicts_total',
      help: 'Total de gravações recusadas por sobreposição de horário, por origem',
      labelNames: ['origin'],
      registers: [registry],
    });
    this.cancelledTotal = new Counter({
      name: 'appointments_cancelled_total',
      help: 'Total de agendamentos cancelados, por origem do pedido',
      labelNames: ['origin'],
      registers: [registry],
    });
  }

  booked(origin: AppointmentOrigin): void {
    this.bookedTotal.inc({ origin });
  }

  conflict(origin: AppointmentOrigin): void {
    this.conflictsTotal.inc({ origin });
  }

  cancelled(origin: AppointmentOrigin): void {
    this.cancelledTotal.inc({ origin });
  }
}

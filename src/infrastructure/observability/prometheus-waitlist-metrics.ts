import { Counter, Registry } from 'prom-client';
import {
  WaitlistEntryEvent,
  WaitlistMetrics,
  WaitlistOfferOutcome,
} from '../../usecases/ports/waitlist-metrics.port';

// US-24: labels are the closed sets of the port, never a client or barbershop.
export class PrometheusWaitlistMetrics implements WaitlistMetrics {
  private readonly entriesTotal: Counter<'event'>;
  private readonly offersTotal: Counter<'outcome'>;

  constructor(registry: Registry) {
    this.entriesTotal = new Counter({
      name: 'waitlist_entries_total',
      help: 'Total de inscrições na lista de espera, por evento',
      labelNames: ['event'],
      registers: [registry],
    });
    this.offersTotal = new Counter({
      name: 'waitlist_offers_total',
      help: 'Total de ofertas de horário da lista de espera, por desfecho',
      labelNames: ['outcome'],
      registers: [registry],
    });
  }

  entry(event: WaitlistEntryEvent): void {
    this.entriesTotal.inc({ event });
  }

  offer(outcome: WaitlistOfferOutcome, count = 1): void {
    this.offersTotal.inc({ outcome }, count);
  }
}

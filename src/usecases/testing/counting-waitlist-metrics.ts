import {
  WaitlistEntryEvent,
  WaitlistMetrics,
  WaitlistOfferOutcome,
} from '../ports/waitlist-metrics.port';

export class CountingWaitlistMetrics implements WaitlistMetrics {
  readonly entries: WaitlistEntryEvent[] = [];
  readonly offers: WaitlistOfferOutcome[] = [];

  entry(event: WaitlistEntryEvent): void {
    this.entries.push(event);
  }

  offer(outcome: WaitlistOfferOutcome, count = 1): void {
    for (let index = 0; index < count; index += 1) this.offers.push(outcome);
  }
}

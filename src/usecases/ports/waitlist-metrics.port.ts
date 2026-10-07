export const WAITLIST_METRICS = Symbol('WaitlistMetrics');

export type WaitlistEntryEvent = 'joined' | 'expired' | 'booked';

export type WaitlistOfferOutcome =
  'sent' | 'send_failed' | 'accepted' | 'declined' | 'expired';

export interface WaitlistMetrics {
  entry(event: WaitlistEntryEvent): void;
  offer(outcome: WaitlistOfferOutcome, count?: number): void;
}

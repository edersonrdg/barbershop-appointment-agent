import type { HandoffReason } from '../../domain/value-objects/handoff-reason';
import {
  BookingDraft,
  ConversationEntry,
  ConversationRepository,
  WaitingConversation,
} from '../ports/conversation.repository.port';

export interface ConversationRow {
  consecutiveFailures: number;
  pausedAt: Date | null;
  pauseReason: HandoffReason | null;
  lastActivityAt: Date;
  bookingDraft?: BookingDraft | null;
}

export class InMemoryConversationRepository implements ConversationRepository {
  readonly rows = new Map<string, ConversationRow>();

  row(barbershopId: string, clientId: string): ConversationRow | undefined {
    return this.rows.get(`${barbershopId}:${clientId}`);
  }

  enter(
    barbershopId: string,
    clientId: string,
    at: Date,
    expiredBefore: Date,
  ): Promise<ConversationEntry> {
    const row = this.row(barbershopId, clientId);
    if (!row) {
      this.rows.set(`${barbershopId}:${clientId}`, {
        consecutiveFailures: 0,
        pausedAt: null,
        pauseReason: null,
        lastActivityAt: at,
      });
      return Promise.resolve('active');
    }
    const inForce = pauseInForce(row, expiredBefore);
    const wasPaused = row.pausedAt !== null;
    row.lastActivityAt = latest(row.lastActivityAt, at);
    if (inForce) return Promise.resolve('paused');
    if (!wasPaused) return Promise.resolve('active');
    Object.assign(row, {
      pausedAt: null,
      pauseReason: null,
      consecutiveFailures: 0,
    });
    return Promise.resolve('resumed');
  }

  touchPaused(
    barbershopId: string,
    clientId: string,
    at: Date,
    expiredBefore: Date,
  ): Promise<boolean> {
    const row = this.row(barbershopId, clientId);
    if (!row || !pauseInForce(row, expiredBefore)) {
      return Promise.resolve(false);
    }
    row.lastActivityAt = latest(row.lastActivityAt, at);
    return Promise.resolve(true);
  }

  recordFailure(barbershopId: string, clientId: string): Promise<number> {
    const row = this.row(barbershopId, clientId);
    if (!row) return Promise.resolve(0);
    row.consecutiveFailures += 1;
    return Promise.resolve(row.consecutiveFailures);
  }

  resetFailures(barbershopId: string, clientId: string): Promise<void> {
    const row = this.row(barbershopId, clientId);
    if (row) row.consecutiveFailures = 0;
    return Promise.resolve();
  }

  findDraft(
    barbershopId: string,
    clientId: string,
  ): Promise<BookingDraft | null> {
    const draft = this.row(barbershopId, clientId)?.bookingDraft;
    return Promise.resolve(draft ? copyDraft(draft) : null);
  }

  saveDraft(
    barbershopId: string,
    clientId: string,
    draft: BookingDraft,
  ): Promise<void> {
    const row = this.row(barbershopId, clientId);
    if (row) row.bookingDraft = copyDraft(draft);
    return Promise.resolve();
  }

  clearDraft(barbershopId: string, clientId: string): Promise<void> {
    const row = this.row(barbershopId, clientId);
    if (row) row.bookingDraft = null;
    return Promise.resolve();
  }

  consumeDraft(
    barbershopId: string,
    clientId: string,
    draftId: string,
  ): Promise<boolean> {
    const row = this.row(barbershopId, clientId);
    if (row?.bookingDraft?.id !== draftId) return Promise.resolve(false);
    row.bookingDraft = null;
    return Promise.resolve(true);
  }

  pause(
    barbershopId: string,
    clientId: string,
    reason: HandoffReason,
    at: Date,
  ): Promise<boolean> {
    const row = this.row(barbershopId, clientId);
    if (!row || row.pausedAt) return Promise.resolve(false);
    row.pausedAt = at;
    row.pauseReason = reason;
    row.bookingDraft = null;
    return Promise.resolve(true);
  }

  resume(barbershopId: string, clientId: string): Promise<boolean> {
    const row = this.row(barbershopId, clientId);
    if (!row?.pausedAt) return Promise.resolve(false);
    Object.assign(row, {
      pausedAt: null,
      pauseReason: null,
      consecutiveFailures: 0,
      bookingDraft: null,
    });
    return Promise.resolve(true);
  }

  listWaiting(): Promise<WaitingConversation[]> {
    return Promise.reject(new Error('not used by unit tests'));
  }
}

function pauseInForce(row: ConversationRow, expiredBefore: Date): boolean {
  if (!row.pausedAt) return false;
  return latest(row.pausedAt, row.lastActivityAt) > expiredBefore;
}

function latest(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function copyDraft(draft: BookingDraft): BookingDraft {
  return {
    ...draft,
    serviceIds: [...draft.serviceIds],
    candidates: draft.candidates.map((candidate) => ({ ...candidate })),
    offer: draft.offer.map((slot) => ({ ...slot })),
  };
}

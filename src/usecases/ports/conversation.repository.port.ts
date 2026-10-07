import type { HandoffReason } from '../../domain/value-objects/handoff-reason';
import type { BookingPeriod } from './message-interpreter.port';

export const CONVERSATION_REPOSITORY = Symbol('ConversationRepository');

/** What a client message finds when it enters the conversation. */
export type ConversationEntry = 'active' | 'resumed' | 'paused';

export interface WaitingConversation {
  clientId: string;
  clientName: string;
  /** E.164 phone of the client (RN-08). */
  phone: string;
  reason: HandoffReason;
  pausedAt: Date;
  lastActivityAt: Date;
}

export interface OfferedSlot {
  barberId: string;
  startsAt: Date;
}

/** US-18: what the client asked to do with the draft. */
export type DraftAction = 'book' | 'cancel' | 'reschedule';

/** US-18: an appointment of the client listed for them to pick one. */
export interface AppointmentCandidate {
  appointmentId: string;
  barberId: string;
  startsAt: Date;
}

/**
 * US-23: the add-on offered in this draft. While `pending`, the client has not
 * answered; once answered it is never suggested again in the draft.
 */
export interface AddOnSuggestion {
  serviceId: string;
  pending: boolean;
}

/**
 * US-17: what the bot knows of the booking in progress (AD-013). US-18: also
 * of a cancellation or rescheduling; the criteria and the offer then search
 * the new slot of `targetAppointmentId`.
 */
export interface BookingDraft {
  id: string;
  action: DraftAction;
  /** Listed while the client picks which appointment (CA-18.2). */
  candidates: AppointmentCandidate[];
  /** The appointment to reschedule, once known. */
  targetAppointmentId: string | null;
  serviceIds: string[];
  barberId: string | null;
  anyBarber: boolean;
  date: string | null;
  period: BookingPeriod | null;
  time: string | null;
  /** The options shown to the client, in order. */
  offer: OfferedSlot[];
  /** US-23: `null` while no add-on was suggested in this draft. */
  addOnSuggestion: AddOnSuggestion | null;
  updatedAt: Date;
}

// US-16: the bot's state with each client of a barbershop. A pause is in force
// while the latest of its start and the last activity is after `expiredBefore`
// (RN-23, door 3).
export interface ConversationRepository {
  /**
   * Records a client message at `at`, creating the conversation when absent.
   * A pause no longer in force is lifted with the failure count (`resumed`).
   */
  enter(
    barbershopId: string,
    clientId: string,
    at: Date,
    expiredBefore: Date,
  ): Promise<ConversationEntry>;
  /**
   * Records `at` as the last activity of a pause still in force; `false` when
   * there is none, and then nothing is written.
   */
  touchPaused(
    barbershopId: string,
    clientId: string,
    at: Date,
    expiredBefore: Date,
  ): Promise<boolean>;
  /** Adds one understanding failure and resolves to the new count. */
  recordFailure(barbershopId: string, clientId: string): Promise<number>;
  resetFailures(barbershopId: string, clientId: string): Promise<void>;
  /** The stored draft; `null` when there is none or it is unreadable. */
  findDraft(
    barbershopId: string,
    clientId: string,
  ): Promise<BookingDraft | null>;
  saveDraft(
    barbershopId: string,
    clientId: string,
    draft: BookingDraft,
  ): Promise<void>;
  clearDraft(barbershopId: string, clientId: string): Promise<void>;
  /**
   * Removes the draft only while it is still the one with `draftId`, so of two
   * messages choosing from the same offer only one resolves to true.
   */
  consumeDraft(
    barbershopId: string,
    clientId: string,
    draftId: string,
  ): Promise<boolean>;
  /**
   * Pauses the conversation unless it is already paused, so of two concurrent
   * pauses only one resolves to true. The draft is dropped with it.
   */
  pause(
    barbershopId: string,
    clientId: string,
    reason: HandoffReason,
    at: Date,
  ): Promise<boolean>;
  /**
   * Lifts the pause, the failure count and the draft; `false` when it was not
   * paused.
   */
  resume(barbershopId: string, clientId: string): Promise<boolean>;
  /** Pauses still in force, oldest first. */
  listWaiting(
    barbershopId: string,
    expiredBefore: Date,
  ): Promise<WaitingConversation[]>;
}

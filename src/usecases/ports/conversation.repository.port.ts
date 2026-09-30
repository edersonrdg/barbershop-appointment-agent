import type { HandoffReason } from '../../domain/value-objects/handoff-reason';

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
  /**
   * Pauses the conversation unless it is already paused, so of two concurrent
   * pauses only one resolves to true.
   */
  pause(
    barbershopId: string,
    clientId: string,
    reason: HandoffReason,
    at: Date,
  ): Promise<boolean>;
  /** Lifts the pause and the failure count; `false` when it was not paused. */
  resume(barbershopId: string, clientId: string): Promise<boolean>;
  /** Pauses still in force, oldest first. */
  listWaiting(
    barbershopId: string,
    expiredBefore: Date,
  ): Promise<WaitingConversation[]>;
}

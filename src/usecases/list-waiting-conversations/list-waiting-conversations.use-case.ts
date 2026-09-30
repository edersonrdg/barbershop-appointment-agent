import { Clock } from '../ports/clock.port';
import {
  ConversationRepository,
  WaitingConversation,
} from '../ports/conversation.repository.port';
import { handoffExpiredBefore } from '../shared/handoff-expiry';

export interface ListWaitingConversationsInput {
  barbershopId: string;
}

// US-16 (CA-16.6): the conversations the team still has to answer; a pause
// past its deadline is back with the bot and is left out (RN-23).
export class ListWaitingConversationsUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly clock: Clock,
    private readonly resumeAfterHours: number,
  ) {}

  execute(
    input: ListWaitingConversationsInput,
  ): Promise<WaitingConversation[]> {
    return this.conversations.listWaiting(
      input.barbershopId,
      handoffExpiredBefore(this.clock.now(), this.resumeAfterHours),
    );
  }
}

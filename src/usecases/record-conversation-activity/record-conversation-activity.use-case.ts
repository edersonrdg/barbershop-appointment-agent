import { ClientRepository } from '../ports/client.repository.port';
import { Clock } from '../ports/clock.port';
import { ConversationRepository } from '../ports/conversation.repository.port';
import { handoffExpiredBefore } from '../shared/handoff-expiry';

export interface RecordConversationActivityInput {
  barbershopId: string;
  /** E.164 phone of the client the message was sent by or to (RN-08). */
  phone: string;
}

// US-16: a message the bot does not answer (from the team, or without text)
// still keeps a paused conversation with the team (RN-23, CA-16.5). It never
// creates a client or a conversation.
export class RecordConversationActivityUseCase {
  constructor(
    private readonly clients: ClientRepository,
    private readonly conversations: ConversationRepository,
    private readonly clock: Clock,
    private readonly resumeAfterHours: number,
  ) {}

  async execute(input: RecordConversationActivityInput): Promise<void> {
    const client = await this.clients.findByPhone(
      input.barbershopId,
      input.phone,
    );
    if (!client) return;
    const now = this.clock.now();
    await this.conversations.touchPaused(
      input.barbershopId,
      client.id,
      now,
      handoffExpiredBefore(now, this.resumeAfterHours),
    );
  }
}

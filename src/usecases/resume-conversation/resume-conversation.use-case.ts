import { ClientNotFoundError } from '../../domain/errors/client-not-found.error';
import { ClientRepository } from '../ports/client.repository.port';
import { ConversationRepository } from '../ports/conversation.repository.port';
import { WhatsAppMetrics } from '../ports/whatsapp-metrics.port';

export interface ResumeConversationInput {
  barbershopId: string;
  clientId: string;
}

// US-16 (RF-15, CA-16.4): the Owner hands a paused conversation back to the
// bot. Resuming a conversation that is not paused changes nothing.
export class ResumeConversationUseCase {
  constructor(
    private readonly clients: ClientRepository,
    private readonly conversations: ConversationRepository,
    private readonly metrics: WhatsAppMetrics,
  ) {}

  async execute(input: ResumeConversationInput): Promise<void> {
    const client = await this.clients.findById(
      input.barbershopId,
      input.clientId,
    );
    if (!client) throw new ClientNotFoundError();
    if (await this.conversations.resume(input.barbershopId, client.id)) {
      this.metrics.botResumed('owner');
    }
  }
}

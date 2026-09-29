import { InboundMessageRepository } from '../ports/inbound-message.repository.port';

export class InMemoryInboundMessageRepository implements InboundMessageRepository {
  private readonly claimed = new Set<string>();

  claim(barbershopId: string, messageId: string): Promise<boolean> {
    const key = `${barbershopId}:${messageId}`;
    if (this.claimed.has(key)) return Promise.resolve(false);
    this.claimed.add(key);
    return Promise.resolve(true);
  }
}

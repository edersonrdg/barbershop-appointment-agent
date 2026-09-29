import { MessageInterpreterUnavailableError } from '../../domain/errors/message-interpreter-unavailable.error';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { InboundMessageRepository } from '../ports/inbound-message.repository.port';
import { MessageInterpreter } from '../ports/message-interpreter.port';
import { ServiceRepository } from '../ports/service.repository.port';
import { WhatsAppConnectionRepository } from '../ports/whatsapp-connection.repository.port';
import { WhatsAppConnector } from '../ports/whatsapp-connector.port';
import {
  ClientReplyKind,
  WhatsAppMetrics,
} from '../ports/whatsapp-metrics.port';
import {
  ClientQuestionReply,
  composeReply,
  UNAVAILABLE_REPLY,
} from './client-question-reply';

export interface AnswerClientQuestionInput {
  barbershopId: string;
  /** E.164 phone of the client who wrote (RN-08). */
  phone: string;
  /** The WhatsApp id of the message, unique per barbershop. */
  messageId: string;
  text: string;
}

export type ClientReplyResult =
  | { outcome: 'none' }
  | { outcome: 'sent'; kind: ClientReplyKind }
  | { outcome: 'failed'; error: unknown };

// Bounds the cost of a single message sent to the model (AC 19).
const MAX_TEXT_LENGTH = 1000;
const TRAILING_HIGH_SURROGATE_PATTERN = /[\uD800-\uDBFF]$/;
const NO_REPLY: ClientReplyResult = { outcome: 'none' };

// US-15: answers questions about services, prices, address and opening hours
// with the barbershop's data only (RF-05, RF-08, RF-09).
export class AnswerClientQuestionUseCase {
  constructor(
    private readonly connections: WhatsAppConnectionRepository,
    private readonly barbershops: BarbershopRepository,
    private readonly services: ServiceRepository,
    private readonly inboundMessages: InboundMessageRepository,
    private readonly interpreter: MessageInterpreter,
    private readonly connector: WhatsAppConnector,
    private readonly metrics: WhatsAppMetrics,
    private readonly clock: Clock,
  ) {}

  async execute(input: AnswerClientQuestionInput): Promise<ClientReplyResult> {
    const text = input.text.trim();
    if (!text) return NO_REPLY;
    const connection = await this.connections.findByBarbershopId(
      input.barbershopId,
    );
    if (!connection) return NO_REPLY;
    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) return NO_REPLY;
    // A redelivered message is answered once; the claim is kept even when the
    // reply fails, so a retry never sends a second answer (door 3).
    const claimed = await this.inboundMessages.claim(
      input.barbershopId,
      input.messageId,
      this.clock.now(),
    );
    if (!claimed) return NO_REPLY;

    const services = await this.services.listActiveByBarbershop(
      input.barbershopId,
    );
    let reply: ClientQuestionReply;
    try {
      const interpretation = await this.interpreter.interpret({
        barbershopName: barbershop.name,
        serviceNames: services.map((service) => service.name),
        text: truncate(text),
      });
      reply = composeReply(barbershop, services, interpretation);
    } catch (error) {
      if (!(error instanceof MessageInterpreterUnavailableError)) throw error;
      reply = { kind: 'unavailable', text: UNAVAILABLE_REPLY };
    }

    try {
      await this.connector.sendText(
        input.barbershopId,
        input.phone,
        reply.text,
      );
    } catch (error) {
      return { outcome: 'failed', error };
    }
    this.metrics.reply(reply.kind);
    return { outcome: 'sent', kind: reply.kind };
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text
    .slice(0, MAX_TEXT_LENGTH)
    .replace(TRAILING_HIGH_SURROGATE_PATTERN, '');
}

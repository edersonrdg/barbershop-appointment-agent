import { MessageInterpreterUnavailableError } from '../../domain/errors/message-interpreter-unavailable.error';
import type { HandoffReason } from '../../domain/value-objects/handoff-reason';
import { BookViaWhatsAppUseCase } from '../book-via-whatsapp/book-via-whatsapp.use-case';
import { ConfirmPresenceViaWhatsAppUseCase } from '../confirm-presence-via-whatsapp/confirm-presence-via-whatsapp.use-case';
import { GetSuspensionReasonUseCase } from '../get-suspension-reason/get-suspension-reason.use-case';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { ClientRepository } from '../ports/client.repository.port';
import { Clock } from '../ports/clock.port';
import { ConversationRepository } from '../ports/conversation.repository.port';
import { InboundMessageRepository } from '../ports/inbound-message.repository.port';
import { MessageInterpreter } from '../ports/message-interpreter.port';
import { ServiceRepository } from '../ports/service.repository.port';
import { WhatsAppConnectionRepository } from '../ports/whatsapp-connection.repository.port';
import { WhatsAppConnector } from '../ports/whatsapp-connector.port';
import {
  ClientReplyKind,
  WhatsAppMetrics,
} from '../ports/whatsapp-metrics.port';
import { handoffExpiredBefore } from '../shared/handoff-expiry';
import {
  ClientQuestionReply,
  composeReply,
  fallbackReply,
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

/**
 * `handoff` is set when the message paused the conversation (US-16), and
 * `appointmentId` when it booked (US-17), cancelled or rescheduled (US-18).
 */
export type ClientReplyResult =
  | { outcome: 'none' }
  | {
      outcome: 'sent';
      kind: ClientReplyKind;
      handoff?: HandoffReason;
      appointmentId?: string;
    }
  | {
      outcome: 'failed';
      error: unknown;
      handoff?: HandoffReason;
      /** The reply that was not sent, given with `appointmentId`. */
      kind?: ClientReplyKind;
      appointmentId?: string;
    };

export const HANDOFF_REPLY = 'Vou chamar alguém da equipe para te ajudar.';

export function suspendedReplyText(barbershopName: string): string {
  return `Olá! No momento o atendimento automático da ${barbershopName} está indisponível. Para agendar ou tirar dúvidas, fale direto com a barbearia.`;
}

// Bounds the cost of a single message sent to the model (AC 19).
const MAX_TEXT_LENGTH = 1000;
const TRAILING_HIGH_SURROGATE_PATTERN = /[\uD800-\uDBFF]$/;
const NO_REPLY: ClientReplyResult = { outcome: 'none' };
// RF-12: the bot hands over on the second consecutive misunderstanding.
const FAILURES_BEFORE_HANDOFF = 2;

// US-15: answers questions about services, prices, address and opening hours
// with the barbershop's data only (RF-05, RF-08, RF-09). US-16: hands the
// conversation to a human and stays silent while it is paused (RN-22, RN-23).
// US-17: a booking request goes to the booking use case, after the request
// for a person and the off-topic refusal and before the questions. US-18: so
// does a request to cancel or reschedule. US-19: a confirmation of presence
// comes after those, before the questions. US-23: so does accepting the
// suggested add-on. US-21: a suspended barbershop gets
// a fixed reply, without the model, once a paused conversation stayed silent.
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
    private readonly clients: ClientRepository,
    private readonly conversations: ConversationRepository,
    private readonly resumeAfterHours: number,
    private readonly booking: BookViaWhatsAppUseCase,
    private readonly presence: ConfirmPresenceViaWhatsAppUseCase,
    private readonly suspension: GetSuspensionReasonUseCase,
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

    const client = await this.clients.findByPhone(
      input.barbershopId,
      input.phone,
    );
    if (!client) return NO_REPLY;
    const now = this.clock.now();
    const entry = await this.conversations.enter(
      input.barbershopId,
      client.id,
      now,
      handoffExpiredBefore(now, this.resumeAfterHours),
    );
    if (entry === 'paused') return NO_REPLY;
    if (entry === 'resumed') this.metrics.botResumed('timeout');
    if (await this.suspension.execute(input.barbershopId)) {
      return this.sendSuspendedReply(input, barbershop.name);
    }

    const services = await this.services.listActiveByBarbershop(
      input.barbershopId,
    );
    const preparation = await this.booking.prepare(
      barbershop,
      client.id,
      now,
      services,
    );
    let reply: ClientQuestionReply;
    let appointmentId: string | undefined;
    try {
      const interpretation = await this.interpreter.interpret({
        barbershopName: barbershop.name,
        serviceNames: services.map((service) => service.name),
        text: truncate(text),
        ...preparation.interpreterInput,
      });
      if (interpretation.humanRequested) {
        return this.handOff(input, client.id, 'requested', now);
      }
      if (
        !interpretation.offTopic &&
        (interpretation.bookingRequested ||
          interpretation.cancelRequested ||
          interpretation.rescheduleRequested ||
          interpretation.addOnAccepted ||
          interpretation.choice !== null)
      ) {
        const outcome = await this.booking.handle({
          barbershop,
          client,
          services,
          preparation,
          interpretation,
          now,
        });
        if (outcome.type === 'handoff') {
          return this.handOff(
            input,
            client.id,
            outcome.reason,
            now,
            outcome.notice,
          );
        }
        if (outcome.type === 'silent') return NO_REPLY;
        if (outcome.type === 'not_understood') {
          reply = fallbackReply(barbershop);
        } else {
          reply = { kind: outcome.kind, text: outcome.text };
          if (outcome.kind !== 'booking') appointmentId = outcome.appointmentId;
        }
      } else if (!interpretation.offTopic && interpretation.confirmRequested) {
        const confirmation = await this.presence.execute({
          barbershop,
          clientId: client.id,
          now,
        });
        for (let count = 0; count < confirmation.confirmed; count += 1) {
          this.metrics.presenceConfirmed();
        }
        reply = { kind: confirmation.kind, text: confirmation.text };
      } else {
        reply = composeReply(barbershop, services, interpretation);
      }
    } catch (error) {
      if (!(error instanceof MessageInterpreterUnavailableError)) throw error;
      reply = { kind: 'unavailable', text: UNAVAILABLE_REPLY };
    }

    if (reply.kind === 'fallback') {
      const failures = await this.conversations.recordFailure(
        input.barbershopId,
        client.id,
      );
      if (failures >= FAILURES_BEFORE_HANDOFF) {
        return this.handOff(input, client.id, 'not_understood', now);
      }
    } else if (reply.kind !== 'unavailable') {
      await this.conversations.resetFailures(input.barbershopId, client.id);
    }

    try {
      await this.connector.sendText(
        input.barbershopId,
        input.phone,
        reply.text,
      );
    } catch (error) {
      return {
        outcome: 'failed',
        error,
        ...(appointmentId && { appointmentId, kind: reply.kind }),
      };
    }
    this.metrics.reply(reply.kind);
    return {
      outcome: 'sent',
      kind: reply.kind,
      ...(appointmentId && { appointmentId }),
    };
  }

  // RN-25: the bot stops booking and sends the client to the barbershop; the
  // platform does not pay the model for a barbershop that does not pay.
  private async sendSuspendedReply(
    input: AnswerClientQuestionInput,
    barbershopName: string,
  ): Promise<ClientReplyResult> {
    try {
      await this.connector.sendText(
        input.barbershopId,
        input.phone,
        suspendedReplyText(barbershopName),
      );
    } catch (error) {
      return { outcome: 'failed', error };
    }
    this.metrics.reply('suspended');
    return { outcome: 'sent', kind: 'suspended' };
  }

  // The pause is stored before the notice goes out, so a failed send still
  // leaves the conversation with the team; of two concurrent hand-offs only the
  // one that paused sends the notice (door 2). `preface` explains why, in the
  // same message (US-18).
  private async handOff(
    input: AnswerClientQuestionInput,
    clientId: string,
    reason: HandoffReason,
    now: Date,
    preface?: string,
  ): Promise<ClientReplyResult> {
    if (
      !(await this.conversations.pause(
        input.barbershopId,
        clientId,
        reason,
        now,
      ))
    ) {
      return NO_REPLY;
    }
    this.metrics.handoff(reason);
    try {
      await this.connector.sendText(
        input.barbershopId,
        input.phone,
        preface ? `${preface}\n\n${HANDOFF_REPLY}` : HANDOFF_REPLY,
      );
    } catch (error) {
      return { outcome: 'failed', error, handoff: reason };
    }
    this.metrics.reply('handoff');
    return { outcome: 'sent', kind: 'handoff', handoff: reason };
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text
    .slice(0, MAX_TEXT_LENGTH)
    .replace(TRAILING_HIGH_SURROGATE_PATTERN, '');
}

import { z } from 'zod';
import { HANDOFF_REASONS } from '../../domain/value-objects/handoff-reason';
import type { WaitingConversation } from '../../usecases/ports/conversation.repository.port';

const waitingConversationSchema = z.object({
  clientId: z.uuid().meta({
    description: 'Id do cliente; use na rota de reativação.',
    example: '4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  }),
  clientName: z.string().meta({ example: 'João Silva' }),
  phone: z.string().meta({
    description: 'Telefone do cliente em E.164, para achar a conversa no app.',
    example: '+5511987654321',
  }),
  reason: z.enum(HANDOFF_REASONS).meta({
    description:
      'Por que o bot transferiu: `requested` (o cliente pediu um atendente) ou `not_understood` (duas falhas seguidas de entendimento).',
    example: 'requested',
  }),
  pausedAt: z.iso.datetime().meta({
    description: 'Quando o bot transferiu a conversa (UTC).',
    example: '2026-09-29T14:00:00.000Z',
  }),
  lastActivityAt: z.iso.datetime().meta({
    description:
      'Última mensagem do cliente ou da equipe (UTC). O bot volta sozinho depois de `WHATSAPP_HANDOFF_RESUME_HOURS` horas (padrão 12) sem mensagens.',
    example: '2026-09-29T14:30:00.000Z',
  }),
});

export const waitingConversationListResponseSchema = z.object({
  conversations: z.array(waitingConversationSchema).meta({
    description:
      'Conversas pausadas, da transferência mais antiga para a mais nova.',
  }),
});

export type WaitingConversationListResponse = z.infer<
  typeof waitingConversationListResponseSchema
>;

export class WaitingConversationPresenter {
  static toListResponse(
    conversations: WaitingConversation[],
  ): WaitingConversationListResponse {
    return {
      conversations: conversations.map((conversation) => ({
        clientId: conversation.clientId,
        clientName: conversation.clientName,
        phone: conversation.phone,
        reason: conversation.reason,
        pausedAt: conversation.pausedAt.toISOString(),
        lastActivityAt: conversation.lastActivityAt.toISOString(),
      })),
    };
  }
}

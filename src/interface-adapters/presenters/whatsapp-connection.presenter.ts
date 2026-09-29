import { z } from 'zod';
import { WhatsAppConnection } from '../../domain/entities/whatsapp-connection';

export const whatsAppConnectionResponseSchema = z.object({
  status: z.enum(['connected', 'connecting', 'disconnected']).meta({
    description:
      'Estado do número: `connecting` enquanto o QR code não foi lido.',
    example: 'connected',
  }),
  disconnectedAt: z.iso.datetime().nullable().meta({
    description:
      'Quando a conexão caiu (UTC). Preenchido depois de uma queda até o número voltar a `connected`; o painel mostra o aviso enquanto ele vier preenchido.',
    example: null,
  }),
});

export type WhatsAppConnectionResponse = z.infer<
  typeof whatsAppConnectionResponseSchema
>;

export const whatsAppQrCodeResponseSchema = z.object({
  status: z.literal('connecting').meta({
    description: 'O número aguarda a leitura do QR code.',
    example: 'connecting',
  }),
  qrCode: z.string().meta({
    description:
      'QR code em data URL PNG, para ler no WhatsApp Business. Chame a rota de novo para um QR code atualizado.',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  }),
});

export type WhatsAppQrCodeResponse = z.infer<
  typeof whatsAppQrCodeResponseSchema
>;

export class WhatsAppConnectionPresenter {
  static toResponse(
    connection: WhatsAppConnection,
  ): WhatsAppConnectionResponse {
    return {
      status: connection.status,
      disconnectedAt: connection.disconnectedAt?.toISOString() ?? null,
    };
  }

  static toQrCode(qrCode: string): WhatsAppQrCodeResponse {
    return { status: 'connecting', qrCode };
  }
}

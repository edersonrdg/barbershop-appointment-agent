import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { WhatsAppConnectorState } from '../../../../domain/entities/whatsapp-connection';
import { ApiErrorResponse } from '../../../../interface-adapters/controllers/api-docs/api-error-response.decorator';
import { Public } from '../../../../interface-adapters/controllers/public.decorator';
import { ZodValidationPipe } from '../../../../interface-adapters/controllers/zod-validation.pipe';
import { AnswerClientQuestionUseCase } from '../../../../usecases/answer-client-question/answer-client-question.use-case';
import { ApplyWhatsAppConnectionStateUseCase } from '../../../../usecases/apply-whatsapp-connection-state/apply-whatsapp-connection-state.use-case';
import type { Clock } from '../../../../usecases/ports/clock.port';
import { CLOCK } from '../../../../usecases/ports/clock.port';
import { ReceiveWhatsAppMessageUseCase } from '../../../../usecases/receive-whatsapp-message/receive-whatsapp-message.use-case';
import { RecordConversationActivityUseCase } from '../../../../usecases/record-conversation-activity/record-conversation-activity.use-case';
import {
  EvolutionWebhookGuard,
  WEBHOOK_UNAUTHORIZED_MESSAGE,
} from './evolution-webhook.guard';
import type { EvolutionWebhook } from './evolution-webhook.schema';
import {
  evolutionMessageSchema,
  evolutionWebhookSchema,
} from './evolution-webhook.schema';
import { phoneFromJid } from './whatsapp-jid';

// `refused` is sent when the Evolution API gives up issuing QR codes.
const STATE_BY_EVOLUTION = new Map<string, WhatsAppConnectorState>([
  ['open', 'open'],
  ['connecting', 'connecting'],
  ['close', 'close'],
  ['refused', 'close'],
]);

const barbershopIdSchema = z.uuid();

// When the instance connects, the Evolution API re-emits recent history as
// `messages.upsert`; only messages sent in this window count as a contact.
const MESSAGE_MAX_AGE_MS = 5 * 60 * 1000;

// LGPD: the body and headers are never logged; they carry the instance token and, from
// US-14 on, client messages.
@ApiTags('Integrações')
@Public()
@Controller('webhooks/whatsapp/evolution')
@UseGuards(EvolutionWebhookGuard)
export class EvolutionWebhookController {
  private readonly logger = new Logger(EvolutionWebhookController.name);

  constructor(
    private readonly applyState: ApplyWhatsAppConnectionStateUseCase,
    private readonly receiveMessage: ReceiveWhatsAppMessageUseCase,
    private readonly answerQuestion: AnswerClientQuestionUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly recordActivity: RecordConversationActivityUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Recebe os eventos da Evolution API (US-13, US-14, US-15, US-16, US-17, US-18)',
    description:
      'Chamado só pela Evolution API, com `authorization: Bearer <WHATSAPP_WEBHOOK_SECRET>`. Aplica `connection.update` à conexão da barbearia cujo id é `instance`; uma queda (conectado → desconectado) envia e-mail aos Donos. Em `messages.upsert` (US-14), a mensagem de um cliente cadastra o telefone na primeira vez, com o nome do perfil, e envia uma única vez o aviso de privacidade; são ignoradas as mensagens enviadas pelo próprio número, de grupos e listas, sem telefone brasileiro ou com mais de 5 minutos. Depois do aviso, uma mensagem de texto (US-15) recebe a resposta às dúvidas sobre serviços, preços, durações, endereço e horário de funcionamento, montada só com os dados cadastrados; assuntos fora da barbearia são recusados, e cada mensagem (`key.id`) é respondida uma única vez. Quando o cliente pede um atendente ou o bot não o entende duas vezes seguidas (US-16), o cliente recebe "Vou chamar alguém da equipe para te ajudar." e o bot fica calado naquela conversa até o Dono reativá-lo ou até `WHATSAPP_HANDOFF_RESUME_HOURS` horas (padrão 12) sem mensagens; enquanto isso, as mensagens do cliente e as respostas da equipe pelo app (enviadas pelo próprio número) só contam como atividade da conversa. Um pedido de agendamento (US-17) pergunta o serviço e a preferência de barbeiro quando faltam e oferece até 3 horários livres do motor de disponibilidade, a partir de agora mais a antecedência mínima; responder com o número de uma opção agenda o horário como confirmado, com origem `bot`, e envia serviço, barbeiro, data, hora, valor e endereço. Horário ocupado no meio da conversa, antecedência vencida ou período sem horário recebem o aviso e novas opções. Cliente bloqueado por faltas não agenda: a conversa é transferida com o motivo `blocked_client`. Um pedido de cancelamento ou remarcação (US-18) acha os agendamentos confirmados futuros do cliente e, havendo mais de um, pergunta qual; dentro do prazo de cancelamento das regras da barbearia (padrão 2h), cancelar marca o agendamento como `cancelled` e libera o horário, e remarcar oferece novos horários como um agendamento novo e só cancela o antigo depois de agendar o novo. Fora do prazo, o cliente recebe a regra e a conversa é transferida com o motivo `late_cancellation`; cliente bloqueado por faltas pode cancelar, mas a remarcação é transferida com `blocked_client`. Outros eventos, estados desconhecidos e barbearias sem conexão são aceitos e ignorados.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Evento recebido (aplicado ou ignorado).',
  })
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    'Header `authorization` ausente ou com outro segredo.',
    WEBHOOK_UNAUTHORIZED_MESSAGE,
  )
  async receive(
    @Body(new ZodValidationPipe(evolutionWebhookSchema)) body: EvolutionWebhook,
  ): Promise<void> {
    if (body.event === 'messages.upsert') {
      await this.handleMessage(body);
      return;
    }
    if (body.event !== 'connection.update') return;
    const state = stateOf(body.data);
    const barbershopId = barbershopIdSchema.safeParse(body.instance);
    if (!state || !barbershopId.success) return;

    const { alert } = await this.applyState.execute({
      barbershopId: barbershopId.data,
      state,
    });
    if (alert.outcome === 'failed') {
      this.logger.error(
        { barbershopId: barbershopId.data, err: errorIdentity(alert.error) },
        'WhatsApp drop alert could not be e-mailed.',
      );
    }
  }

  private async handleMessage(body: EvolutionWebhook): Promise<void> {
    const barbershopId = barbershopIdSchema.safeParse(body.instance);
    const message = evolutionMessageSchema.safeParse(body.data);
    if (!barbershopId.success || !message.success) return;
    const { key, pushName, messageTimestamp } = message.data;
    const text =
      message.data.message?.conversation ??
      message.data.message?.extendedTextMessage?.text;
    const age = this.clock.now().getTime() - messageTimestamp * 1000;
    if (age > MESSAGE_MAX_AGE_MS) return;
    const phone = phoneFromJid(key.remoteJid);
    if (!phone) return;
    // US-16: a reply of the team through the app keeps a paused conversation
    // with the team (RN-23); it is never answered nor registers a client.
    if (key.fromMe) {
      await this.recordActivity.execute({
        barbershopId: barbershopId.data,
        phone,
      });
      return;
    }

    const notice = await this.receiveMessage.execute({
      barbershopId: barbershopId.data,
      phone,
      profileName: pushName ?? null,
    });
    if (notice.outcome === 'failed') {
      this.logger.error(
        { barbershopId: barbershopId.data, err: errorIdentity(notice.error) },
        'Privacy notice could not be sent.',
      );
    }
    if (!key.id || !text) {
      await this.recordActivity.execute({
        barbershopId: barbershopId.data,
        phone,
      });
      return;
    }

    const reply = await this.answerQuestion.execute({
      barbershopId: barbershopId.data,
      phone,
      messageId: key.id,
      text,
    });
    if (reply.outcome !== 'none' && reply.handoff) {
      this.logger.log(
        { barbershopId: barbershopId.data, reason: reply.handoff },
        'Conversation handed to a human.',
      );
    }
    if (reply.outcome !== 'none' && reply.appointmentId) {
      this.logger.log(
        {
          barbershopId: barbershopId.data,
          appointmentId: reply.appointmentId,
        },
        'Appointment booked by the bot.',
      );
    }
    if (reply.outcome === 'failed') {
      this.logger.error(
        { barbershopId: barbershopId.data, err: errorIdentity(reply.error) },
        'Reply could not be sent.',
      );
    }
  }
}

function stateOf(data: unknown): WhatsAppConnectorState | null {
  if (typeof data !== 'object' || data === null) return null;
  const { state } = data as { state?: unknown };
  return typeof state === 'string'
    ? (STATE_BY_EVOLUTION.get(state) ?? null)
    : null;
}

// LGPD: an e-mail or connector error may carry the Owner's address or the
// client's phone, so only its name and code are logged.
function errorIdentity(error: unknown): { name?: string; code?: string } {
  const { name, code } = (error ?? {}) as { name?: string; code?: string };
  return { name, code };
}

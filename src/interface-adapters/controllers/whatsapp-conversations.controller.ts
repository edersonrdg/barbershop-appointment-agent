import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListWaitingConversationsUseCase } from '../../usecases/list-waiting-conversations/list-waiting-conversations.use-case';
import { ResumeConversationUseCase } from '../../usecases/resume-conversation/resume-conversation.use-case';
import {
  WaitingConversationListResponse,
  waitingConversationListResponseSchema,
  WaitingConversationPresenter,
} from '../presenters/waiting-conversation.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import type { ConversationClientParams } from './schemas/conversation-client.params.schema';
import { conversationClientParamsSchema } from './schemas/conversation-client.params.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Owner only: no @Roles, so the session guard denies barbers (AD-007, RF-15).
// RN-26: the tenant comes only from the session.
@ApiTags('Atendimento')
@Controller('whatsapp/conversations')
export class WhatsAppConversationsController {
  constructor(
    private readonly listWaitingConversations: ListWaitingConversationsUseCase,
    private readonly resumeConversation: ResumeConversationUseCase,
  ) {}

  @Get('waiting-human')
  @ApiOperation({
    summary: 'Lista as conversas aguardando atendimento humano (US-16)',
    description:
      'Conversas em que o bot está pausado porque o cliente pediu um atendente, porque o bot não o entendeu duas vezes seguidas ou porque um cliente bloqueado por faltas pediu para agendar (US-17). A equipe responde pelo app WhatsApp Business. Uma conversa sai da lista quando o Dono reativa o bot ou depois de `WHATSAPP_HANDOFF_RESUME_HOURS` horas (padrão 12) sem mensagens do cliente nem da equipe.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Conversas aguardando humano; lista vazia quando não há.',
    schema: waitingConversationListResponseSchema,
  })
  async listWaiting(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<WaitingConversationListResponse> {
    return WaitingConversationPresenter.toListResponse(
      await this.listWaitingConversations.execute({
        barbershopId: session.barbershopId,
      }),
    );
  }

  @Post(':clientId/resume')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reativa o bot na conversa com um cliente (US-16)',
    description:
      'Tira a pausa e zera as falhas de entendimento; a próxima mensagem do cliente é respondida pelo bot. Reativar uma conversa que não está pausada não muda nada.',
  })
  @ApiZodResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Bot ativo na conversa.',
  })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Não há cliente com esse id nesta barbearia (RN-26).',
    'Cliente não encontrado.',
  )
  async resume(
    @CurrentSession() session: AuthenticatedSession,
    @Param(new ZodValidationPipe(conversationClientParamsSchema))
    params: ConversationClientParams,
  ): Promise<void> {
    await this.resumeConversation.execute({
      barbershopId: session.barbershopId,
      clientId: params.clientId,
    });
  }
}

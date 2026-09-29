import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
import { ApplyWhatsAppConnectionStateUseCase } from '../../../../usecases/apply-whatsapp-connection-state/apply-whatsapp-connection-state.use-case';
import {
  EvolutionWebhookGuard,
  WEBHOOK_UNAUTHORIZED_MESSAGE,
} from './evolution-webhook.guard';
import type { EvolutionWebhook } from './evolution-webhook.schema';
import { evolutionWebhookSchema } from './evolution-webhook.schema';

// `refused` is sent when the Evolution API gives up issuing QR codes.
const STATE_BY_EVOLUTION = new Map<string, WhatsAppConnectorState>([
  ['open', 'open'],
  ['connecting', 'connecting'],
  ['close', 'close'],
  ['refused', 'close'],
]);

const barbershopIdSchema = z.uuid();

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
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Recebe os eventos da Evolution API (US-13)',
    description:
      'Chamado só pela Evolution API, com `authorization: Bearer <WHATSAPP_WEBHOOK_SECRET>`. Aplica `connection.update` à conexão da barbearia cujo id é `instance`; uma queda (conectado → desconectado) envia e-mail aos Donos. Outros eventos, estados desconhecidos e barbearias sem conexão são aceitos e ignorados.',
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
}

function stateOf(data: unknown): WhatsAppConnectorState | null {
  if (typeof data !== 'object' || data === null) return null;
  const { state } = data as { state?: unknown };
  return typeof state === 'string'
    ? (STATE_BY_EVOLUTION.get(state) ?? null)
    : null;
}

// LGPD: an e-mail error may carry the Owner's address, so only its name and
// code are logged.
function errorIdentity(error: unknown): { name?: string; code?: string } {
  const { name, code } = (error ?? {}) as { name?: string; code?: string };
  return { name, code };
}

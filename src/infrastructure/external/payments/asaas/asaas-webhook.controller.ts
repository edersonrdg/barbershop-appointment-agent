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
import { ApiErrorResponse } from '../../../../interface-adapters/controllers/api-docs/api-error-response.decorator';
import { Public } from '../../../../interface-adapters/controllers/public.decorator';
import { ZodValidationPipe } from '../../../../interface-adapters/controllers/zod-validation.pipe';
import { ApplyPaymentEventUseCase } from '../../../../usecases/apply-payment-event/apply-payment-event.use-case';
import { errorIdentity } from '../../../jobs/error-identity';
import { WEBHOOK_UNAUTHORIZED_MESSAGE } from '../../whatsapp/evolution/evolution-webhook.guard';
import type { AsaasWebhook } from './asaas-payment-event';
import { asaasWebhookSchema, toPaymentEvent } from './asaas-payment-event';
import { AsaasWebhookGuard } from './asaas-webhook.guard';

// US-20 (door 5): every authenticated event is answered with 200, applied or
// not; the Asaas pauses the account's webhook queue after repeated errors. A
// failure while applying answers 500 so the redelivery applies it (door 2).
@ApiTags('Integrações')
@Public()
@Controller('webhooks/payments/asaas')
@UseGuards(AsaasWebhookGuard)
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  constructor(private readonly applyPaymentEvent: ApplyPaymentEventUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recebe os eventos de cobrança do Asaas (US-20)',
    description:
      'Chamado só pelo Asaas, com o header `asaas-access-token` igual a `ASAAS_WEBHOOK_TOKEN`. `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` deixam a barbearia `active`, pagos até um mês depois do vencimento da cobrança. `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_REPROVED_BY_RISK_ANALYSIS` e `PAYMENT_OVERDUE` de um mês ainda não pago deixam uma barbearia `active` como `past_due` e enviam aos Donos um e-mail com o link da fatura. A barbearia sai do id da assinatura no Asaas. Um evento já aplicado (mesmo `id`), outros eventos e assinaturas desconhecidas são aceitos e ignorados.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Evento recebido (aplicado ou ignorado).',
  })
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    'Header `asaas-access-token` ausente ou com outro token.',
    WEBHOOK_UNAUTHORIZED_MESSAGE,
  )
  async receive(
    @Body(new ZodValidationPipe(asaasWebhookSchema)) body: AsaasWebhook,
  ): Promise<void> {
    const event = toPaymentEvent(body);
    if (!event) return;
    const result = await this.applyPaymentEvent.execute(event);
    if (result.outcome === 'applied') {
      this.logger.log(
        {
          barbershopId: result.barbershopId,
          eventId: event.eventId,
          kind: event.kind,
        },
        'Payment event applied.',
      );
    }
    if (result.email.outcome === 'failed') {
      this.logger.error(
        {
          barbershopId: result.barbershopId,
          err: errorIdentity(result.email.error),
        },
        'Payment failure e-mail could not be sent.',
      );
    }
  }
}

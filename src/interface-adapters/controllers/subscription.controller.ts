import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CancelSubscriptionUseCase } from '../../usecases/cancel-subscription/cancel-subscription.use-case';
import { GetSubscriptionUseCase } from '../../usecases/get-subscription/get-subscription.use-case';
import { StartSubscriptionCheckoutUseCase } from '../../usecases/start-subscription-checkout/start-subscription-checkout.use-case';
import {
  CancelSubscriptionResponse,
  cancelSubscriptionResponseSchema,
  CheckoutResponse,
  checkoutResponseSchema,
  SubscriptionPresenter,
  SubscriptionResponse,
  subscriptionResponseSchema,
} from '../presenters/subscription.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import type { StartCheckoutBody } from './schemas/start-checkout.schema';
import { startCheckoutSchema } from './schemas/start-checkout.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

const GATEWAY_DOWN =
  'Não foi possível falar com o serviço de pagamento. Tente novamente.';

// Owner only: no @Roles, so the session guard denies barbers (AD-007,
// CA-02.2). RN-26: the tenant comes only from the session.
@ApiTags('Assinatura')
@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly getSubscription: GetSubscriptionUseCase,
    private readonly startCheckout: StartSubscriptionCheckoutUseCase,
    private readonly cancelSubscription: CancelSubscriptionUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Situação da assinatura da barbearia (US-20)',
    description:
      'Status, fim do teste e aviso de fim próximo, preço, método, data paga, próxima cobrança, cancelamento e link da cobrança recusada.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Assinatura da barbearia da sessão.',
    schema: subscriptionResponseSchema,
  })
  async show(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<SubscriptionResponse> {
    return SubscriptionPresenter.toResponse(
      await this.getSubscription.execute({
        barbershopId: session.barbershopId,
      }),
    );
  }

  @Post('checkout')
  @ApiOperation({
    summary: 'Inicia o pagamento da assinatura por cartão ou Pix (US-20)',
    description:
      'Cartão: cria o checkout recorrente do Asaas, com a primeira cobrança hoje e as seguintes todo mês. Pix: cria no Asaas uma assinatura mensal com o CPF/CNPJ informado e devolve a primeira fatura, com o QR Code Pix; uma assinatura Pix anterior ainda não paga é cancelada antes. Só no teste gratuito. A assinatura fica `active` quando o Asaas confirma o pagamento pelo webhook.',
  })
  @ApiZodResponse({
    status: HttpStatus.CREATED,
    description: 'Link da página de pagamento do Asaas.',
    schema: checkoutResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'A barbearia já está `active` ou `past_due`.',
    'Esta barbearia já tem uma assinatura.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_GATEWAY,
    'O Asaas não respondeu ou respondeu com erro.',
    GATEWAY_DOWN,
  )
  async checkout(
    @CurrentSession() session: AuthenticatedSession,
    @Body(new ZodValidationPipe(startCheckoutSchema)) body: StartCheckoutBody,
  ): Promise<CheckoutResponse> {
    return SubscriptionPresenter.toCheckout(
      await this.startCheckout.execute({
        barbershopId: session.barbershopId,
        userId: session.userId,
        ...body,
      }),
    );
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancela a assinatura ao fim do período pago (US-20)',
    description:
      'Encerra a assinatura no Asaas, sem novas cobranças. A barbearia continua `active` até `cancelsAt`, o último dia pago.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Cancelamento registrado.',
    schema: cancelSubscriptionResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'A barbearia não está `active` ou já pediu o cancelamento.',
    'Não há assinatura ativa para cancelar.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_GATEWAY,
    'O Asaas não respondeu ou respondeu com erro.',
    GATEWAY_DOWN,
  )
  async cancel(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<CancelSubscriptionResponse> {
    return SubscriptionPresenter.toCancelled(
      await this.cancelSubscription.execute({
        barbershopId: session.barbershopId,
      }),
    );
  }
}

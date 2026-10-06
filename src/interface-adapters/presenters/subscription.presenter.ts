import { z } from 'zod';
import { SUBSCRIPTION_STATUSES } from '../../domain/entities/barbershop';
import { PAYMENT_METHODS } from '../../domain/entities/barbershop-subscription';
import { CancelSubscriptionResult } from '../../usecases/cancel-subscription/cancel-subscription.use-case';
import { SubscriptionOverview } from '../../usecases/get-subscription/get-subscription.use-case';
import { StartSubscriptionCheckoutResult } from '../../usecases/start-subscription-checkout/start-subscription-checkout.use-case';
import { suspensionReasonSchema } from './suspension-reason.schema';

const localDate = (description: string) =>
  z.iso.date().nullable().meta({ description, example: '2026-11-02' });

export const subscriptionResponseSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES).meta({
    description:
      '`trialing` no teste gratuito, `active` com a assinatura paga (também depois de pedir o cancelamento, até `cancelsAt`) e `past_due` depois de uma cobrança recusada.',
    example: 'trialing',
  }),
  trialEndsAt: z.iso.datetime().meta({
    description: 'Fim do teste gratuito, em UTC (ISO 8601).',
  }),
  trialEndingSoon: z.boolean().meta({
    description:
      'Verdadeiro no teste gratuito quando faltam `SUBSCRIPTION_TRIAL_WARNING_DAYS` dias ou menos (padrão 3) para o fim; o painel mostra o aviso para assinar.',
    example: false,
  }),
  priceCents: z.number().int().meta({
    description: 'Preço mensal em centavos de real.',
    example: 9900,
  }),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().meta({
    description: 'Método escolhido no último checkout; null antes do primeiro.',
    example: null,
  }),
  paidUntil: localDate(
    'Data (no fuso da barbearia) até a qual o último pagamento confirmado cobre; null antes do primeiro pagamento.',
  ),
  nextChargeDate: localDate(
    'Data da próxima cobrança, enquanto a assinatura está `active` e não foi cancelada; senão null.',
  ),
  cancelsAt: localDate(
    'Último dia pago de uma assinatura cancelada; null sem cancelamento.',
  ),
  paymentIssueUrl: z.string().url().nullable().meta({
    description:
      'Fatura da cobrança recusada, para o Dono pagar de novo; preenchida enquanto `past_due`.',
    example: null,
  }),
  suspensionReason: suspensionReasonSchema,
});

export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;

export const checkoutResponseSchema = z.object({
  paymentUrl: z.string().url().meta({
    description:
      'Página do Asaas onde o Dono paga: o checkout de cartão ou a fatura Pix. A assinatura só fica `active` quando o Asaas confirma o pagamento.',
    example: 'https://sandbox.asaas.com/i/pay_1',
  }),
});

export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const cancelSubscriptionResponseSchema = z.object({
  cancelsAt: z.iso.date().meta({
    description:
      'Último dia pago; a assinatura continua `active` até lá, sem novas cobranças.',
    example: '2026-11-02',
  }),
});

export type CancelSubscriptionResponse = z.infer<
  typeof cancelSubscriptionResponseSchema
>;

export class SubscriptionPresenter {
  static toResponse({
    subscription,
    trialEndingSoon,
    priceCents,
    suspensionReason,
  }: SubscriptionOverview): SubscriptionResponse {
    return {
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt.toISOString(),
      trialEndingSoon,
      priceCents,
      paymentMethod: subscription.paymentMethod,
      paidUntil: subscription.paidUntil,
      nextChargeDate: subscription.nextChargeDate,
      cancelsAt: subscription.cancelsAt,
      paymentIssueUrl: subscription.paymentIssueUrl,
      suspensionReason,
    };
  }

  static toCheckout(result: StartSubscriptionCheckoutResult): CheckoutResponse {
    return { paymentUrl: result.paymentUrl };
  }

  static toCancelled(
    result: CancelSubscriptionResult,
  ): CancelSubscriptionResponse {
    return { cancelsAt: result.cancelsAt };
  }
}

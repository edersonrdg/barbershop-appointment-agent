import { z } from 'zod';
import type { PaymentEvent } from '../../../../usecases/apply-payment-event/apply-payment-event.use-case';
import type { PaymentEventGroup } from '../../../../usecases/ports/payment-metrics.port';

export const ASAAS_GATEWAY = 'asaas';

// US-20: the payment events that change a subscription. Card capture and the
// risk analysis refuse a card charge; `PAYMENT_OVERDUE` is a Pix invoice not
// paid by its due date.
const GROUP_BY_EVENT = new Map<string, PaymentEventGroup>([
  ['PAYMENT_CONFIRMED', 'payment_confirmed'],
  ['PAYMENT_RECEIVED', 'payment_confirmed'],
  ['PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'payment_failed'],
  ['PAYMENT_REPROVED_BY_RISK_ANALYSIS', 'payment_failed'],
  ['PAYMENT_OVERDUE', 'payment_failed'],
]);

/** What the route accepts: anything with these fields is answered with 200. */
export const asaasWebhookSchema = z.looseObject({
  id: z.string().optional().meta({
    description: 'Id do evento; um id já aplicado é ignorado.',
    example: 'evt_05b708f961d739ea7eba7e4db318f621&368604920',
  }),
  event: z.string().optional().meta({ example: 'PAYMENT_CONFIRMED' }),
  payment: z.unknown().optional().meta({
    description:
      'A cobrança do evento; usados `subscription`, `dueDate` e `invoiceUrl`.',
  }),
});

export type AsaasWebhook = z.infer<typeof asaasWebhookSchema>;

const eventSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
});

const paymentSchema = z.object({
  subscription: z.string().min(1),
  dueDate: z.iso.date(),
  invoiceUrl: z.string().url().nullish(),
});

/** Null when the body has no event id or name: nothing to apply or dedupe. */
export function toPaymentEvent(body: unknown): PaymentEvent | null {
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return null;
  const group = GROUP_BY_EVENT.get(parsed.data.event) ?? 'other';
  const payment = paymentSchema.safeParse(
    (body as { payment?: unknown }).payment,
  );
  if (group === 'other' || !payment.success) {
    return {
      gateway: ASAAS_GATEWAY,
      eventId: parsed.data.id,
      kind: 'other',
      gatewaySubscriptionId: null,
      dueDate: null,
      invoiceUrl: null,
    };
  }
  return {
    gateway: ASAAS_GATEWAY,
    eventId: parsed.data.id,
    kind: group,
    gatewaySubscriptionId: payment.data.subscription,
    dueDate: payment.data.dueDate,
    invoiceUrl: payment.data.invoiceUrl ?? null,
  };
}

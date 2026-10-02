import { toPaymentEvent } from './asaas-payment-event';

const PAYMENT = {
  object: 'payment',
  id: 'pay_1',
  subscription: 'sub_1',
  dueDate: '2026-10-02',
  invoiceUrl: 'https://sandbox.asaas.com/i/pay_1',
  status: 'CONFIRMED',
};

function body(event: string, payment: Record<string, unknown> = PAYMENT) {
  return { id: 'evt_1', event, dateCreated: '2026-10-02 12:00:00', payment };
}

describe('US-20 Asaas payment events', () => {
  it.each([
    ['PAYMENT_CONFIRMED', 'payment_confirmed'],
    ['PAYMENT_RECEIVED', 'payment_confirmed'],
    ['PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'payment_failed'],
    ['PAYMENT_REPROVED_BY_RISK_ANALYSIS', 'payment_failed'],
    ['PAYMENT_OVERDUE', 'payment_failed'],
  ])('AC 9, AC 23: %s is %s (C14)', (event, kind) => {
    expect(toPaymentEvent(body(event))).toEqual({
      gateway: 'asaas',
      eventId: 'evt_1',
      kind,
      gatewaySubscriptionId: 'sub_1',
      dueDate: '2026-10-02',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_1',
    });
  });

  it.each([
    'PAYMENT_CREATED',
    'PAYMENT_UPDATED',
    'PAYMENT_REFUNDED',
    'CHECKOUT_PAID',
    'SUBSCRIPTION_CREATED',
    'SOMETHING_NEW',
  ])('door 5: %s is other (C14)', (event) => {
    expect(toPaymentEvent(body(event))?.kind).toBe('other');
  });

  it('door 5: a payment event without a subscription is other (C14)', () => {
    const single: Record<string, unknown> = { ...PAYMENT };
    delete single.subscription;
    expect(toPaymentEvent(body('PAYMENT_CONFIRMED', single))?.kind).toBe(
      'other',
    );
  });

  it('door 5: a body without id or event has nothing to apply (C14)', () => {
    expect(
      toPaymentEvent({ event: 'PAYMENT_CONFIRMED', payment: PAYMENT }),
    ).toBeNull();
    expect(toPaymentEvent({ id: 'evt_1', payment: PAYMENT })).toBeNull();
    expect(toPaymentEvent(null)).toBeNull();
  });
});

import { DomainError } from './domain.error';

export class PaymentGatewayUnavailableError extends DomainError {
  readonly code = 'PAYMENT_GATEWAY_UNAVAILABLE';

  constructor() {
    super(
      'Não foi possível falar com o serviço de pagamento. Tente novamente.',
    );
  }
}

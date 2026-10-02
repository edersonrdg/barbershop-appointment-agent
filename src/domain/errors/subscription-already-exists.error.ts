import { DomainError } from './domain.error';

export class SubscriptionAlreadyExistsError extends DomainError {
  readonly code = 'SUBSCRIPTION_ALREADY_EXISTS';

  constructor() {
    super('Esta barbearia já tem uma assinatura.');
  }
}

import { DomainError } from './domain.error';

export class NoActiveSubscriptionError extends DomainError {
  readonly code = 'NO_ACTIVE_SUBSCRIPTION';

  constructor() {
    super('Não há assinatura ativa para cancelar.');
  }
}

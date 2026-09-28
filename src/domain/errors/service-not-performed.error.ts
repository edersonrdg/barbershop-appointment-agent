import { DomainError } from './domain.error';

export class ServiceNotPerformedError extends DomainError {
  readonly code = 'SERVICE_NOT_PERFORMED';

  constructor() {
    super('O barbeiro não realiza todos os serviços escolhidos.');
  }
}

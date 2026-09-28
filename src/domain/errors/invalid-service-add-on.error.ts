import { DomainError } from './domain.error';

export class InvalidServiceAddOnError extends DomainError {
  readonly code = 'INVALID_SERVICE_ADD_ON';

  constructor(message: string) {
    super(message, 'RF-33');
  }
}

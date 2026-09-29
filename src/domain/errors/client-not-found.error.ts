import { DomainError } from './domain.error';

export class ClientNotFoundError extends DomainError {
  readonly code = 'CLIENT_NOT_FOUND';

  constructor() {
    super('Cliente não encontrado.', 'RN-26');
  }
}

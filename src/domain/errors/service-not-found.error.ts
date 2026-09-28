import { DomainError } from './domain.error';

export class ServiceNotFoundError extends DomainError {
  readonly code = 'SERVICE_NOT_FOUND';

  constructor() {
    super('Serviço não encontrado.', 'RN-26');
  }
}

import { DomainError } from './domain.error';

export class ServiceNameAlreadyExistsError extends DomainError {
  readonly code = 'SERVICE_NAME_ALREADY_EXISTS';

  constructor() {
    super('Já existe um serviço com esse nome.', 'RF-33');
  }
}

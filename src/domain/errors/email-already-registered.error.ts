import { DomainError } from './domain.error';

export class EmailAlreadyRegisteredError extends DomainError {
  readonly code = 'EMAIL_ALREADY_REGISTERED';

  constructor() {
    super('Este e-mail já está cadastrado.', 'RN-EMAIL-UNIQUE');
  }
}

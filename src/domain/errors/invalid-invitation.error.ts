import { DomainError } from './domain.error';

export class InvalidInvitationError extends DomainError {
  readonly code = 'INVALID_INVITATION';

  constructor() {
    super('Convite inválido ou expirado.');
  }
}

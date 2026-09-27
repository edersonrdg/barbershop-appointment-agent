import { DomainError } from './domain.error';

export class InvalidPasswordResetTokenError extends DomainError {
  readonly code = 'INVALID_PASSWORD_RESET_TOKEN';

  constructor() {
    super('Link de redefinição inválido ou expirado.');
  }
}

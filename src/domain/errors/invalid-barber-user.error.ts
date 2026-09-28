import { DomainError } from './domain.error';

export class InvalidBarberUserError extends DomainError {
  readonly code = 'INVALID_BARBER_USER';

  constructor() {
    super('Usuário não encontrado.', 'RN-26');
  }
}

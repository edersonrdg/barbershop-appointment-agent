import { DomainError } from './domain.error';

export class BarberUserAlreadyLinkedError extends DomainError {
  readonly code = 'BARBER_USER_ALREADY_LINKED';

  constructor() {
    super('Esse usuário já está vinculado a outro barbeiro.', 'RF-34');
  }
}

import { DomainError } from './domain.error';

export class BarberNotFoundError extends DomainError {
  readonly code = 'BARBER_NOT_FOUND';

  constructor() {
    super('Barbeiro não encontrado.', 'RN-26');
  }
}

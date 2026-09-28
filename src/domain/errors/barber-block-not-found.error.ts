import { DomainError } from './domain.error';

export class BarberBlockNotFoundError extends DomainError {
  readonly code = 'BARBER_BLOCK_NOT_FOUND';

  constructor() {
    super('Bloqueio não encontrado.', 'RN-26');
  }
}

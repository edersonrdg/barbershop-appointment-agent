import { DomainError } from './domain.error';

export class InvalidBarberServiceError extends DomainError {
  readonly code = 'INVALID_BARBER_SERVICE';

  constructor(message: string) {
    super(message, 'RF-34');
  }
}

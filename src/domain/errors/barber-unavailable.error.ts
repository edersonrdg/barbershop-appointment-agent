import { DomainError } from './domain.error';

export class BarberUnavailableError extends DomainError {
  readonly code = 'BARBER_UNAVAILABLE';

  constructor() {
    super('O barbeiro está indisponível nesse horário.', 'RN-05');
  }
}

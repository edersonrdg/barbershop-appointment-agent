import { DomainError } from './domain.error';

export class BarberNameAlreadyExistsError extends DomainError {
  readonly code = 'BARBER_NAME_ALREADY_EXISTS';

  constructor() {
    super('Já existe um barbeiro com esse nome.', 'RF-34');
  }
}

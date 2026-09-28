import { DomainError } from './domain.error';

export class OutsideOpeningHoursError extends DomainError {
  readonly code = 'OUTSIDE_OPENING_HOURS';

  constructor() {
    super('O horário está fora do funcionamento da barbearia.', 'RN-05');
  }
}

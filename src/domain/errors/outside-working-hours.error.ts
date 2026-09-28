import { DomainError } from './domain.error';

export class OutsideWorkingHoursError extends DomainError {
  readonly code = 'OUTSIDE_WORKING_HOURS';

  constructor() {
    super('O horário está fora da jornada do barbeiro.', 'RN-05');
  }
}

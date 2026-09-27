import { DomainError } from './domain.error';

export class InvalidOpeningHoursError extends DomainError {
  readonly code = 'INVALID_OPENING_HOURS';

  constructor(message: string) {
    super(message, 'RF-32');
  }
}

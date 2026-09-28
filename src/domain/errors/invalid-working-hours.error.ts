import { DomainError } from './domain.error';

export class InvalidWorkingHoursError extends DomainError {
  readonly code = 'INVALID_WORKING_HOURS';

  constructor(message: string) {
    super(message, 'RF-34');
  }
}

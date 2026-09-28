import { DomainError } from './domain.error';

// PRD section 5: a barber sees only their own schedule.
export class ScheduleAccessDeniedError extends DomainError {
  readonly code = 'SCHEDULE_ACCESS_DENIED';

  constructor() {
    super('Acesso negado.');
  }
}

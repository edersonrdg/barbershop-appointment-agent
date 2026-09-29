import { DomainError } from './domain.error';

export class AppointmentNotStartedError extends DomainError {
  readonly code = 'APPOINTMENT_NOT_STARTED';

  constructor() {
    super('O agendamento ainda não começou.', 'RF-27');
  }
}

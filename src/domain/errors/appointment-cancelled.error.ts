import { DomainError } from './domain.error';

export class AppointmentCancelledError extends DomainError {
  readonly code = 'APPOINTMENT_CANCELLED';

  constructor() {
    super('Esse agendamento foi cancelado.', 'RN-11');
  }
}

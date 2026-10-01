import { DomainError } from './domain.error';

export class AppointmentNotConfirmedError extends DomainError {
  readonly code = 'APPOINTMENT_NOT_CONFIRMED';

  constructor() {
    super('Só um agendamento confirmado pode ser cancelado.', 'RF-04');
  }
}

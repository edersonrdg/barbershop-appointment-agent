import { DomainError } from './domain.error';

export class AppointmentNotFoundError extends DomainError {
  readonly code = 'APPOINTMENT_NOT_FOUND';

  constructor() {
    super('Agendamento não encontrado.', 'RN-26');
  }
}

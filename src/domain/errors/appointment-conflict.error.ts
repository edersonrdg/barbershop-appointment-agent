import { DomainError } from './domain.error';

// RN-03 when the application finds the overlap; RN-07 when the database
// exclusion constraint refuses a booking that lost the race.
export type AppointmentConflictRule = 'RN-03' | 'RN-07';

export class AppointmentConflictError extends DomainError {
  readonly code = 'APPOINTMENT_CONFLICT';

  constructor(rule: AppointmentConflictRule) {
    super('O barbeiro já tem um agendamento nesse horário.', rule);
  }
}

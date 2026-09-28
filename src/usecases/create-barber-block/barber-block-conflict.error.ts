import { DomainError } from '../../domain/errors/domain.error';
import { ScheduleEntry } from '../ports/schedule.query.port';

// CA-09.3: the block is only saved after the user sees the appointments it
// reaches, so the error carries them. It lives here because the domain does
// not know the schedule read model.
export class BarberBlockConflictError extends DomainError {
  readonly code = 'BARBER_BLOCK_CONFLICT';

  constructor(readonly appointments: ScheduleEntry[]) {
    super('O bloqueio conflita com agendamentos existentes.');
  }
}

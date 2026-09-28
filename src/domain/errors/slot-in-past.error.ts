import { DomainError } from './domain.error';

export class SlotInPastError extends DomainError {
  readonly code = 'SLOT_IN_PAST';

  constructor() {
    super('O horário já passou.');
  }
}

import { DomainError } from './domain.error';

export class MinimumAdvanceNotMetError extends DomainError {
  readonly code = 'MINIMUM_ADVANCE_NOT_MET';

  constructor(minimumAdvanceMinutes: number) {
    super(
      `Escolha um horário com pelo menos ${minimumAdvanceMinutes} minutos de antecedência.`,
      'RN-02',
    );
  }
}

import { DomainError } from './domain.error';

export class MessageInterpreterUnavailableError extends DomainError {
  readonly code = 'MESSAGE_INTERPRETER_UNAVAILABLE';

  constructor() {
    super('Não foi possível interpretar a mensagem agora.');
  }
}

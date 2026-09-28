import { DomainError } from './domain.error';

// RN-08: another request stored a client with the same phone between the
// lookup and the INSERT; the caller looks the client up again and retries.
export class ClientPhoneTakenError extends DomainError {
  readonly code = 'CLIENT_PHONE_TAKEN';

  constructor() {
    super('O telefone já pertence a um cliente da barbearia.', 'RN-08');
  }
}

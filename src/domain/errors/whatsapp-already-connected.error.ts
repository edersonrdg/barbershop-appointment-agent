import { DomainError } from './domain.error';

export class WhatsAppAlreadyConnectedError extends DomainError {
  readonly code = 'WHATSAPP_ALREADY_CONNECTED';

  constructor() {
    super('O WhatsApp já está conectado.');
  }
}

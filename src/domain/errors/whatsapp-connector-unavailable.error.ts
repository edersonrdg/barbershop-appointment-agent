import { DomainError } from './domain.error';

export class WhatsAppConnectorUnavailableError extends DomainError {
  readonly code = 'WHATSAPP_CONNECTOR_UNAVAILABLE';

  constructor() {
    super('Não foi possível falar com o WhatsApp. Tente de novo em instantes.');
  }
}

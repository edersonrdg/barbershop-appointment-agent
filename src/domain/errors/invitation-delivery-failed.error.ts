import { DomainError } from './domain.error';

export class InvitationDeliveryFailedError extends DomainError {
  readonly code = 'INVITATION_DELIVERY_FAILED';

  constructor() {
    super('Não foi possível enviar o convite. Tente novamente.');
  }
}

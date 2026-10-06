import { ClientNotFoundError } from '../../domain/errors/client-not-found.error';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { ClientRepository } from '../ports/client.repository.port';
import { Clock } from '../ports/clock.port';
import { NoShowLedger } from '../ports/no-show-ledger.port';
import { clientNoShowStatus } from '../shared/client-no-show-status';

export interface UnblockClientInput {
  barbershopId: string;
  clientId: string;
}

// US-22 (RF-31, RN-14): the Owner forgives the no-shows of a blocked client
// with the same reset the 90-day rule uses (RN-13), so the bot books for them
// again. Unblocking a client that is not blocked changes nothing.
export class UnblockClientUseCase {
  constructor(
    private readonly clients: ClientRepository,
    private readonly ledger: NoShowLedger,
    private readonly bookingRules: BookingRulesRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: UnblockClientInput): Promise<void> {
    const client = await this.clients.findById(
      input.barbershopId,
      input.clientId,
    );
    if (!client) throw new ClientNotFoundError();
    const { selfBookingBlocked } = await clientNoShowStatus(
      this.ledger,
      this.bookingRules,
      input.barbershopId,
      client.id,
    );
    if (!selfBookingBlocked) return;
    await this.ledger.resetClient(
      input.barbershopId,
      client.id,
      this.clock.now(),
    );
  }
}

import { WhatsAppConnection } from '../../domain/entities/whatsapp-connection';
import {
  ApplyWhatsAppConnectionStateUseCase,
  DropAlert,
} from '../apply-whatsapp-connection-state/apply-whatsapp-connection-state.use-case';
import { Clock } from '../ports/clock.port';
import { WhatsAppConnectionRepository } from '../ports/whatsapp-connection.repository.port';
import { WhatsAppConnector } from '../ports/whatsapp-connector.port';

export interface GetWhatsAppConnectionInput {
  barbershopId: string;
}

export interface GetWhatsAppConnectionResult {
  connection: WhatsAppConnection;
  alert: DropAlert;
}

export class GetWhatsAppConnectionUseCase {
  constructor(
    private readonly connections: WhatsAppConnectionRepository,
    private readonly connector: WhatsAppConnector,
    private readonly applyState: ApplyWhatsAppConnectionStateUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: GetWhatsAppConnectionInput,
  ): Promise<GetWhatsAppConnectionResult> {
    const stored = await this.connections.findByBarbershopId(
      input.barbershopId,
    );
    if (!stored) {
      return {
        connection: WhatsAppConnection.neverConnected(
          input.barbershopId,
          this.clock.now(),
        ),
        alert: { outcome: 'none' },
      };
    }

    // CA-13.2: the panel shows the live state, which also catches a drop whose
    // webhook never arrived. A connector that does not answer leaves the
    // stored state as the best known one.
    const state = await this.connector
      .getState(input.barbershopId)
      .catch(() => null);
    if (!state) {
      return { connection: stored, alert: { outcome: 'none' } };
    }
    const { connection, alert } = await this.applyState.execute({
      barbershopId: input.barbershopId,
      state,
    });
    return { connection: connection ?? stored, alert };
  }
}

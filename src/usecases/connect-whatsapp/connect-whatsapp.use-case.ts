import { WhatsAppConnection } from '../../domain/entities/whatsapp-connection';
import { WhatsAppAlreadyConnectedError } from '../../domain/errors/whatsapp-already-connected.error';
import { Clock } from '../ports/clock.port';
import { WhatsAppConnectionRepository } from '../ports/whatsapp-connection.repository.port';
import { WhatsAppConnector } from '../ports/whatsapp-connector.port';

export interface ConnectWhatsAppInput {
  barbershopId: string;
}

export interface ConnectWhatsAppResult {
  connection: WhatsAppConnection;
  qrCode: string;
}

export class ConnectWhatsAppUseCase {
  constructor(
    private readonly connections: WhatsAppConnectionRepository,
    private readonly connector: WhatsAppConnector,
    private readonly clock: Clock,
  ) {}

  async execute(input: ConnectWhatsAppInput): Promise<ConnectWhatsAppResult> {
    const stored =
      (await this.connections.findByBarbershopId(input.barbershopId)) ??
      WhatsAppConnection.neverConnected(input.barbershopId, this.clock.now());
    if (stored.status === 'connected') {
      throw new WhatsAppAlreadyConnectedError();
    }

    await this.connector.ensureInstance(input.barbershopId);
    // The QR code is a login credential for the number, so it is never stored.
    const qrCode = await this.connector.requestQrCode(input.barbershopId);
    const connection = stored.startConnecting(this.clock.now());
    await this.connections.save(connection);
    return { connection, qrCode };
  }
}

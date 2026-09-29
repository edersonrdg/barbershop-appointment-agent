import { WhatsAppConnectorState } from '../../domain/entities/whatsapp-connection';
import { WhatsAppConnectorUnavailableError } from '../../domain/errors/whatsapp-connector-unavailable.error';
import { WhatsAppConnector } from '../ports/whatsapp-connector.port';

export type FakeConnectorCall =
  'ensureInstance' | 'requestQrCode' | 'getState' | 'ping';

export class FakeWhatsAppConnector implements WhatsAppConnector {
  readonly calls: { operation: FakeConnectorCall; barbershopId?: string }[] =
    [];
  state: WhatsAppConnectorState = 'connecting';
  qrCodes: string[] = [];
  failing = new Set<FakeConnectorCall>();
  private issued = 0;

  ensureInstance(barbershopId: string): Promise<void> {
    return this.call('ensureInstance', barbershopId, undefined);
  }

  requestQrCode(barbershopId: string): Promise<string> {
    this.issued += 1;
    const qrCode =
      this.qrCodes.shift() ?? `data:image/png;base64,QR${this.issued}`;
    return this.call('requestQrCode', barbershopId, qrCode);
  }

  getState(barbershopId: string): Promise<WhatsAppConnectorState> {
    return this.call('getState', barbershopId, this.state);
  }

  ping(): Promise<void> {
    return this.call('ping', undefined, undefined);
  }

  reset(): void {
    this.calls.length = 0;
    this.state = 'connecting';
    this.qrCodes = [];
    this.failing.clear();
    this.issued = 0;
  }

  private call<T>(
    operation: FakeConnectorCall,
    barbershopId: string | undefined,
    value: T,
  ): Promise<T> {
    this.calls.push({ operation, barbershopId });
    if (this.failing.has(operation)) {
      return Promise.reject(new WhatsAppConnectorUnavailableError());
    }
    return Promise.resolve(value);
  }
}

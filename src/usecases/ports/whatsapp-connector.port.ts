import { WhatsAppConnectorState } from '../../domain/entities/whatsapp-connection';

export const WHATSAPP_CONNECTOR = Symbol('WhatsAppConnector');

// RNF-05 (AD-011): the only way the application talks to WhatsApp. Every
// method rejects with WhatsAppConnectorUnavailableError when the vendor fails.
export interface WhatsAppConnector {
  // Creates the barbershop's instance when it does not exist yet.
  ensureInstance(barbershopId: string): Promise<void>;
  // Resolves to a `data:image/png;base64,...` QR code.
  requestQrCode(barbershopId: string): Promise<string>;
  getState(barbershopId: string): Promise<WhatsAppConnectorState>;
  ping(): Promise<void>;
}

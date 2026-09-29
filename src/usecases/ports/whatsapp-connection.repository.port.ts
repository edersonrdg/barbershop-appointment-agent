import { WhatsAppConnection } from '../../domain/entities/whatsapp-connection';

export const WHATSAPP_CONNECTION_REPOSITORY = Symbol(
  'WhatsAppConnectionRepository',
);

export interface WhatsAppConnectionRepository {
  findByBarbershopId(barbershopId: string): Promise<WhatsAppConnection | null>;
  save(connection: WhatsAppConnection): Promise<void>;
  // Records a drop only while the stored connection is still connected, so of
  // two concurrent drops only one returns true and alerts the Owner.
  recordDrop(connection: WhatsAppConnection): Promise<boolean>;
}

export const WHATSAPP_METRICS = Symbol('WhatsAppMetrics');

export interface WhatsAppMetrics {
  disconnected(): void;
}

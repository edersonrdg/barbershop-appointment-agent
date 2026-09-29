export const INBOUND_MESSAGE_REPOSITORY = Symbol('InboundMessageRepository');

export interface InboundMessageRepository {
  /**
   * Records the WhatsApp message id of the barbershop; `false` when it was
   * already recorded, so a redelivered message is answered once.
   */
  claim(
    barbershopId: string,
    messageId: string,
    receivedAt: Date,
  ): Promise<boolean>;
}

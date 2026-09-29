import { Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';

// US-15 (door 3): only the id of each answered message, never its content.
@Entity({ name: 'whatsapp_inbound_messages' })
export class WhatsAppInboundMessageEntity {
  @ForeignKey(() => BarbershopEntity, { onDelete: 'CASCADE' })
  @PrimaryColumn({
    name: 'barbershop_id',
    type: 'uuid',
    primaryKeyConstraintName: 'PK_whatsapp_inbound_messages',
  })
  barbershopId!: string;

  @PrimaryColumn({
    name: 'message_id',
    type: 'text',
    primaryKeyConstraintName: 'PK_whatsapp_inbound_messages',
  })
  messageId!: string;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;
}

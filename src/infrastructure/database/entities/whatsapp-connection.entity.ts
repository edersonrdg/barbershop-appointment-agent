import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import type { WhatsAppConnectionStatus } from '../../../domain/entities/whatsapp-connection';
import { BarbershopEntity } from './barbershop.entity';

@Entity({ name: 'whatsapp_connections' })
@Check(
  'whatsapp_connections_status_check',
  `"status" IN ('disconnected', 'connecting', 'connected')`,
)
export class WhatsAppConnectionEntity {
  @ForeignKey(() => BarbershopEntity, { onDelete: 'CASCADE' })
  @PrimaryColumn({
    name: 'barbershop_id',
    type: 'uuid',
    primaryKeyConstraintName: 'PK_whatsapp_connections_barbershop_id',
  })
  barbershopId!: string;

  @Column({ type: 'text' })
  status!: WhatsAppConnectionStatus;

  @Column({ name: 'disconnected_at', type: 'timestamptz', nullable: true })
  disconnectedAt!: Date | null;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

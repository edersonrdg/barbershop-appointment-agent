import { Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';

// US-20 (door 2): the gateway delivers at least once; the key of an event
// already applied makes its redelivery a no-op.
@Entity({ name: 'payment_gateway_events' })
export class PaymentGatewayEventEntity {
  @PrimaryColumn({
    type: 'varchar',
    length: 20,
    primaryKeyConstraintName: 'PK_payment_gateway_events',
  })
  gateway!: string;

  @PrimaryColumn({
    name: 'event_id',
    type: 'varchar',
    length: 100,
    primaryKeyConstraintName: 'PK_payment_gateway_events',
  })
  eventId!: string;

  @ForeignKey(() => BarbershopEntity, { onDelete: 'CASCADE' })
  @Column({ name: 'barbershop_id', type: 'uuid', nullable: true })
  barbershopId!: string | null;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;
}

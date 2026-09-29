import { Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';

// Structural minimum so the schedule shows who is coming (CA-08.3); the
// clients are created by US-10 and US-14. The phone (E.164) identifies the
// client within the barbershop (RN-08).
@Entity({ name: 'clients' })
@Unique('clients_barbershop_phone_unique', ['barbershopId', 'phone'])
@Unique('clients_id_barbershop_unique', ['id', 'barbershopId'])
export class ClientEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @ForeignKey(() => BarbershopEntity)
  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // RN-13: no-shows that started up to this instant no longer count; null
  // means the client was never reset.
  @Column({ name: 'no_show_reset_at', type: 'timestamptz', nullable: true })
  noShowResetAt!: Date | null;

  // RN-21: the return reminder is off until the client opts in (CA-25.1); the
  // default keeps every insert that predates US-25 valid.
  @Column({ name: 'return_reminder_enabled', type: 'boolean', default: false })
  returnReminderEnabled!: boolean;
}

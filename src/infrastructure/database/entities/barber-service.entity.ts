import { Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { BarberEntity } from './barber.entity';
import { ServiceEntity } from './service.entity';

// Both FKs carry barbershop_id, so a barber can only perform services of its
// own barbershop, even through a direct INSERT (RN-26).
@Entity({ name: 'barber_services' })
@ForeignKey(
  () => BarberEntity,
  ['barberId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'barber_services_barber_fk' },
)
@ForeignKey(
  () => ServiceEntity,
  ['serviceId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'barber_services_service_fk' },
)
export class BarberServiceEntity {
  @PrimaryColumn({ name: 'barber_id', type: 'uuid' })
  barberId!: string;

  @PrimaryColumn({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ type: 'smallint' })
  position!: number;
}

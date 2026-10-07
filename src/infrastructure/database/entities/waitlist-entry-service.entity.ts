import { Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { ServiceEntity } from './service.entity';
import { WaitlistEntryEntity } from './waitlist-entry.entity';

// US-24: the services of an entry in the order the client asked; both FKs
// carry barbershop_id (RN-26), and the services go with their entry.
@Entity({ name: 'waitlist_entry_services' })
@ForeignKey(
  () => WaitlistEntryEntity,
  ['entryId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'waitlist_entry_services_entry_fk', onDelete: 'CASCADE' },
)
@ForeignKey(
  () => ServiceEntity,
  ['serviceId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'waitlist_entry_services_service_fk', onDelete: 'CASCADE' },
)
export class WaitlistEntryServiceEntity {
  @PrimaryColumn({ name: 'entry_id', type: 'uuid' })
  entryId!: string;

  @PrimaryColumn({ type: 'smallint' })
  position!: number;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;
}

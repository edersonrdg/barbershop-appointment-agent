import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { ServiceEntity } from './service.entity';

@Entity({ name: 'service_add_ons' })
@Check('service_add_ons_not_self_check', '"service_id" <> "add_on_service_id"')
export class ServiceAddOnEntity {
  @ForeignKey(() => ServiceEntity)
  @PrimaryColumn({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @ForeignKey(() => ServiceEntity)
  @PrimaryColumn({ name: 'add_on_service_id', type: 'uuid' })
  addOnServiceId!: string;

  @Column({ type: 'smallint' })
  position!: number;
}

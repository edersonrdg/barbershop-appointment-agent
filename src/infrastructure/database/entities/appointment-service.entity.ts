import { Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { AppointmentEntity } from './appointment.entity';
import { ServiceEntity } from './service.entity';

// Both FKs carry barbershop_id, so an appointment can only list services of its
// own barbershop, even through a direct INSERT (RN-26).
@Entity({ name: 'appointment_services' })
@Unique('appointment_services_service_unique', ['appointmentId', 'serviceId'])
@ForeignKey(
  () => AppointmentEntity,
  ['appointmentId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'appointment_services_appointment_fk' },
)
@ForeignKey(
  () => ServiceEntity,
  ['serviceId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'appointment_services_service_fk' },
)
export class AppointmentServiceEntity {
  @PrimaryColumn({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @PrimaryColumn({ type: 'smallint' })
  position!: number;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;
}

import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { BarberEntity } from './barber.entity';

// Structural minimum for the availability engine; reason and CRUD arrive with
// US-09. The barber FK is composite so the barber belongs to the same
// barbershop (RN-26).
@Entity({ name: 'barber_blocks' })
@Index('barber_blocks_barber_range_idx', ['barberId', 'startsAt'])
@ForeignKey(
  () => BarberEntity,
  ['barberId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'barber_blocks_barber_fk' },
)
@Check('barber_blocks_ends_after_starts_check', '"ends_at" > "starts_at"')
export class BarberBlockEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ name: 'barber_id', type: 'uuid' })
  barberId!: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

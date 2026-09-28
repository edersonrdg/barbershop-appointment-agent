import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { BarberBlockKind } from '../../../domain/entities/barber-block';
import { BarberEntity } from './barber.entity';

// The barber FK is composite so the barber belongs to the same barbershop
// (RN-26).
@Entity({ name: 'barber_blocks' })
@Index('barber_blocks_barber_range_idx', ['barberId', 'startsAt'])
@Index('barber_blocks_barbershop_range_idx', ['barbershopId', 'startsAt'])
@ForeignKey(
  () => BarberEntity,
  ['barberId', 'barbershopId'],
  ['id', 'barbershopId'],
  { name: 'barber_blocks_barber_fk' },
)
@Check('barber_blocks_ends_after_starts_check', '"ends_at" > "starts_at"')
@Check('barber_blocks_kind_check', `"kind" IN ('block', 'day_off')`)
export class BarberBlockEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ name: 'barber_id', type: 'uuid' })
  barberId!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: BarberBlockKind;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reason!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

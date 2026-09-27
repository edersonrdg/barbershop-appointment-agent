import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'barbershops' })
export class BarbershopEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'America/Sao_Paulo' })
  timezone!: string;

  @Column({ name: 'subscription_status', type: 'varchar', length: 20 })
  subscriptionStatus!: string;

  @Column({ name: 'trial_ends_at', type: 'timestamptz' })
  trialEndsAt!: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

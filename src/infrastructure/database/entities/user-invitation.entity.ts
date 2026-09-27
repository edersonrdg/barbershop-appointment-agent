import { Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';

@Entity({ name: 'user_invitations' })
@Index('user_invitations_barbershop_email_idx', ['barbershopId', 'email'])
export class UserInvitationEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @ForeignKey(() => BarbershopEntity)
  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index('user_invitations_token_hash_unique', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

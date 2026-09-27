import { Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import { BarbershopEntity } from './barbershop.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'password_reset_tokens' })
export class PasswordResetTokenEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index('password_reset_tokens_user_id_idx')
  @ForeignKey(() => UserEntity, { onDelete: 'CASCADE' })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ForeignKey(() => BarbershopEntity)
  @Column({ name: 'barbershop_id', type: 'uuid' })
  barbershopId!: string;

  @Index('password_reset_tokens_hash_unique', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

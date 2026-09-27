const ONE_HOUR_MS = 60 * 60 * 1000;

export interface PasswordResetTokenProps {
  id: string;
  userId: string;
  barbershopId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export class PasswordResetToken {
  private constructor(private readonly props: PasswordResetTokenProps) {}

  static issue({
    id,
    userId,
    barbershopId,
    tokenHash,
    now,
  }: {
    id: string;
    userId: string;
    barbershopId: string;
    tokenHash: string;
    now: Date;
  }): PasswordResetToken {
    return new PasswordResetToken({
      id,
      userId,
      barbershopId,
      tokenHash,
      expiresAt: new Date(now.getTime() + ONE_HOUR_MS),
      usedAt: null,
      createdAt: now,
    });
  }

  static restore(props: PasswordResetTokenProps): PasswordResetToken {
    return new PasswordResetToken(props);
  }

  isRedeemable(now: Date): boolean {
    return (
      this.props.usedAt === null &&
      now.getTime() < this.props.expiresAt.getTime()
    );
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get barbershopId(): string {
    return this.props.barbershopId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get usedAt(): Date | null {
    return this.props.usedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}

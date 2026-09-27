export const INVITATION_VALIDITY_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface UserInvitationProps {
  id: string;
  barbershopId: string;
  email: string;
  name: string;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export class UserInvitation {
  private constructor(private readonly props: UserInvitationProps) {}

  static issue({
    id,
    barbershopId,
    email,
    name,
    tokenHash,
    now,
  }: {
    id: string;
    barbershopId: string;
    email: string;
    name: string;
    tokenHash: string;
    now: Date;
  }): UserInvitation {
    return new UserInvitation({
      id,
      barbershopId,
      email,
      name,
      tokenHash,
      expiresAt: new Date(now.getTime() + INVITATION_VALIDITY_DAYS * DAY_MS),
      acceptedAt: null,
      createdAt: now,
    });
  }

  static restore(props: UserInvitationProps): UserInvitation {
    return new UserInvitation(props);
  }

  isAcceptable(now: Date): boolean {
    return (
      this.props.acceptedAt === null &&
      now.getTime() < this.props.expiresAt.getTime()
    );
  }

  get id(): string {
    return this.props.id;
  }

  get barbershopId(): string {
    return this.props.barbershopId;
  }

  get email(): string {
    return this.props.email;
  }

  get name(): string {
    return this.props.name;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get acceptedAt(): Date | null {
    return this.props.acceptedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}

export type UserRole = 'owner';

export interface UserProps {
  id: string;
  barbershopId: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static createOwner({
    id,
    barbershopId,
    name,
    email,
    phone,
    passwordHash,
    now,
  }: {
    id: string;
    barbershopId: string;
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    now: Date;
  }): User {
    return new User({
      id,
      barbershopId,
      name,
      email,
      phone,
      passwordHash,
      role: 'owner',
      createdAt: now,
    });
  }

  static restore(props: UserProps): User {
    return new User(props);
  }

  get id(): string {
    return this.props.id;
  }

  get barbershopId(): string {
    return this.props.barbershopId;
  }

  get name(): string {
    return this.props.name;
  }

  get email(): string {
    return this.props.email;
  }

  get phone(): string {
    return this.props.phone;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get role(): UserRole {
    return this.props.role;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}

import { Barbershop } from '../../domain/entities/barbershop';
import { User } from '../../domain/entities/user';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { UserRepository } from '../ports/user.repository.port';

export interface GetMyAccountInput {
  barbershopId: string;
  userId: string;
}

export interface MyAccount {
  user: User;
  barbershop: Barbershop;
}

export class GetMyAccountUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly barbershops: BarbershopRepository,
  ) {}

  async execute(input: GetMyAccountInput): Promise<MyAccount> {
    const user = await this.users.findById(input.barbershopId, input.userId);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new InvalidCredentialsError();
    }

    return { user, barbershop };
  }
}

import { User } from '../../domain/entities/user';
import { UserRepository } from '../ports/user.repository.port';

export interface ListUsersInput {
  barbershopId: string;
}

export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  execute(input: ListUsersInput): Promise<User[]> {
    return this.users.listByBarbershop(input.barbershopId);
  }
}

import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserRepository } from '../ports/user.repository.port';

export interface RemoveBarberInput {
  barbershopId: string;
  userId: string;
}

export class RemoveBarberUseCase {
  constructor(private readonly users: UserRepository) {}

  // RF-37 only lets the owner remove barbers; an owner or a user of another
  // barbershop answers the same as a missing one, so no tenant leaks (RN-26).
  async execute(input: RemoveBarberInput): Promise<void> {
    const removed = await this.users.removeBarber(
      input.barbershopId,
      input.userId,
    );
    if (!removed) {
      throw new UserNotFoundError();
    }
  }
}

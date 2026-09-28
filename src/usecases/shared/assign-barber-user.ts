import { Barber } from '../../domain/entities/barber';
import { InvalidBarberUserError } from '../../domain/errors/invalid-barber-user.error';
import { UserRepository } from '../ports/user.repository.port';

// RN-26: a user of another barbershop answers the same as a missing one.
export async function assignBarberUser(
  users: UserRepository,
  barber: Barber,
  userId: string | null,
): Promise<void> {
  if (userId === null) {
    barber.linkUser(null);
    return;
  }
  const user = await users.findById(barber.barbershopId, userId);
  if (!user) {
    throw new InvalidBarberUserError();
  }
  barber.linkUser(user);
}

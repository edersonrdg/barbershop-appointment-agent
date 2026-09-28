import { Barber } from '../../domain/entities/barber';
import { BarberRepository } from '../ports/barber.repository.port';

export interface FindBarberByUserInput {
  barbershopId: string;
  userId: string;
}

// CA-05.2: the schedule of a panel user is the schedule of the barber linked
// to them; null means the user has no barber schedule of their own.
export class FindBarberByUserUseCase {
  constructor(private readonly barbers: BarberRepository) {}

  execute(input: FindBarberByUserInput): Promise<Barber | null> {
    return this.barbers.findByUserId(input.barbershopId, input.userId);
  }
}

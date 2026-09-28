import { Barber } from '../../domain/entities/barber';
import { BarberRepository } from '../ports/barber.repository.port';

export interface ListSchedulableBarbersInput {
  barbershopId: string;
}

// CA-05.1: the single read of who can be scheduled, with services and working
// hours, shared by the schedule and the bot; an inactive barber is never offered.
export class ListSchedulableBarbersUseCase {
  constructor(private readonly barbers: BarberRepository) {}

  execute(input: ListSchedulableBarbersInput): Promise<Barber[]> {
    return this.barbers.listActiveByBarbershop(input.barbershopId);
  }
}

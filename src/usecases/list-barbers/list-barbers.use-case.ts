import { Barber } from '../../domain/entities/barber';
import { BarberRepository } from '../ports/barber.repository.port';

export interface ListBarbersInput {
  barbershopId: string;
}

export class ListBarbersUseCase {
  constructor(private readonly barbers: BarberRepository) {}

  execute(input: ListBarbersInput): Promise<Barber[]> {
    return this.barbers.listByBarbershop(input.barbershopId);
  }
}

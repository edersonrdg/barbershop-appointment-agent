import { Barber } from '../../domain/entities/barber';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { BarberRepository } from '../ports/barber.repository.port';

export interface SetBarberActiveInput {
  barbershopId: string;
  barberId: string;
  active: boolean;
}

export class SetBarberActiveUseCase {
  constructor(private readonly barbers: BarberRepository) {}

  async execute(input: SetBarberActiveInput): Promise<Barber> {
    const barber = await this.barbers.findById(
      input.barbershopId,
      input.barberId,
    );
    if (!barber) {
      throw new BarberNotFoundError();
    }

    if (input.active) {
      barber.activate();
    } else {
      barber.deactivate();
    }
    await this.barbers.save(barber);
    return barber;
  }
}

import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { ServiceRepository } from '../ports/service.repository.port';
import { UserRepository } from '../ports/user.repository.port';
import { assignBarberServices } from '../shared/assign-barber-services';
import { assignBarberUser } from '../shared/assign-barber-user';
import {
  toWeeklyWorkingHours,
  WorkingHoursInput,
} from '../shared/to-weekly-working-hours';
import {
  SavedBarber,
  workingHoursWarnings,
} from '../shared/working-hours-warnings';

export interface UpdateBarberInput {
  barbershopId: string;
  barberId: string;
  name: string;
  userId: string | null;
  serviceIds: readonly string[];
  workingHours: WorkingHoursInput;
}

export class UpdateBarberUseCase {
  constructor(
    private readonly barbers: BarberRepository,
    private readonly services: ServiceRepository,
    private readonly users: UserRepository,
    private readonly barbershops: BarbershopRepository,
  ) {}

  async execute(input: UpdateBarberInput): Promise<SavedBarber> {
    const workingHours = toWeeklyWorkingHours(input.workingHours);

    // RN-26: a barber of another barbershop answers the same as a missing one.
    const barber = await this.barbers.findById(
      input.barbershopId,
      input.barberId,
    );
    if (!barber) {
      throw new BarberNotFoundError();
    }

    barber.update({ name: input.name, workingHours });
    await assignBarberServices(this.services, barber, input.serviceIds);
    await assignBarberUser(this.users, barber, input.userId);
    const warnings = await workingHoursWarnings(this.barbershops, barber);
    await this.barbers.save(barber);
    return { barber, warnings };
  }
}

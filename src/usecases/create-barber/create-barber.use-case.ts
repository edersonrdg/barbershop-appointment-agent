import { Barber } from '../../domain/entities/barber';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { IdGenerator } from '../ports/id-generator.port';
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

export interface CreateBarberInput {
  barbershopId: string;
  name: string;
  userId: string | null;
  serviceIds: readonly string[];
  workingHours: WorkingHoursInput;
}

export class CreateBarberUseCase {
  constructor(
    private readonly barbers: BarberRepository,
    private readonly services: ServiceRepository,
    private readonly users: UserRepository,
    private readonly barbershops: BarbershopRepository,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: CreateBarberInput): Promise<SavedBarber> {
    const barber = Barber.create({
      id: this.idGenerator.next(),
      barbershopId: input.barbershopId,
      name: input.name,
      workingHours: toWeeklyWorkingHours(input.workingHours),
      now: this.clock.now(),
    });
    await assignBarberServices(this.services, barber, input.serviceIds);
    await assignBarberUser(this.users, barber, input.userId);
    const warnings = await workingHoursWarnings(this.barbershops, barber);
    await this.barbers.create(barber);
    return { barber, warnings };
  }
}

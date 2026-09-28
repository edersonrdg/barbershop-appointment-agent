import { BarbershopService } from '../../domain/entities/barbershop-service';
import { ServiceRepository } from '../ports/service.repository.port';

export interface ListBookableServicesInput {
  barbershopId: string;
}

// CA-04.1 and CA-04.3: the single read of what can be booked, shared by the
// schedule and the bot; an inactive service is never offered.
export class ListBookableServicesUseCase {
  constructor(private readonly services: ServiceRepository) {}

  execute(input: ListBookableServicesInput): Promise<BarbershopService[]> {
    return this.services.listActiveByBarbershop(input.barbershopId);
  }
}

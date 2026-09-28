import { BarbershopService } from '../../domain/entities/barbershop-service';
import { ServiceRepository } from '../ports/service.repository.port';

export interface ListServicesInput {
  barbershopId: string;
}

export class ListServicesUseCase {
  constructor(private readonly services: ServiceRepository) {}

  execute(input: ListServicesInput): Promise<BarbershopService[]> {
    return this.services.listByBarbershop(input.barbershopId);
  }
}

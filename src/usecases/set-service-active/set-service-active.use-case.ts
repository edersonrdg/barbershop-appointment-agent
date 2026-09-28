import { BarbershopService } from '../../domain/entities/barbershop-service';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { ServiceRepository } from '../ports/service.repository.port';

export interface SetServiceActiveInput {
  barbershopId: string;
  serviceId: string;
  active: boolean;
}

export class SetServiceActiveUseCase {
  constructor(private readonly services: ServiceRepository) {}

  async execute(input: SetServiceActiveInput): Promise<BarbershopService> {
    const service = await this.services.findById(
      input.barbershopId,
      input.serviceId,
    );
    if (!service) {
      throw new ServiceNotFoundError();
    }

    if (input.active) {
      service.activate();
    } else {
      service.deactivate();
    }
    await this.services.save(service);
    return service;
  }
}

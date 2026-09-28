import { BarbershopService } from '../../domain/entities/barbershop-service';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { ServiceDuration } from '../../domain/value-objects/service-duration';
import { ServicePrice } from '../../domain/value-objects/service-price';
import { ServiceRepository } from '../ports/service.repository.port';
import { applySuggestedAddOns } from '../shared/apply-suggested-add-ons';

export interface UpdateServiceInput {
  barbershopId: string;
  serviceId: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  suggestedAddOnIds: readonly string[];
}

export class UpdateServiceUseCase {
  constructor(private readonly services: ServiceRepository) {}

  async execute(input: UpdateServiceInput): Promise<BarbershopService> {
    const price = ServicePrice.create(input.priceCents);
    const duration = ServiceDuration.create(input.durationMinutes);

    // RN-26: a service of another barbershop answers the same as a missing one.
    const service = await this.services.findById(
      input.barbershopId,
      input.serviceId,
    );
    if (!service) {
      throw new ServiceNotFoundError();
    }

    service.update({ name: input.name, price, duration });
    await applySuggestedAddOns(this.services, service, input.suggestedAddOnIds);
    await this.services.save(service);
    return service;
  }
}

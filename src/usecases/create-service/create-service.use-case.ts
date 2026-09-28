import { BarbershopService } from '../../domain/entities/barbershop-service';
import { ServiceDuration } from '../../domain/value-objects/service-duration';
import { ServicePrice } from '../../domain/value-objects/service-price';
import { Clock } from '../ports/clock.port';
import { IdGenerator } from '../ports/id-generator.port';
import { ServiceRepository } from '../ports/service.repository.port';
import { applySuggestedAddOns } from '../shared/apply-suggested-add-ons';

export interface CreateServiceInput {
  barbershopId: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  suggestedAddOnIds: readonly string[];
}

export class CreateServiceUseCase {
  constructor(
    private readonly services: ServiceRepository,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: CreateServiceInput): Promise<BarbershopService> {
    const service = BarbershopService.create({
      id: this.idGenerator.next(),
      barbershopId: input.barbershopId,
      name: input.name,
      price: ServicePrice.create(input.priceCents),
      duration: ServiceDuration.create(input.durationMinutes),
      now: this.clock.now(),
    });
    await applySuggestedAddOns(this.services, service, input.suggestedAddOnIds);
    await this.services.create(service);
    return service;
  }
}

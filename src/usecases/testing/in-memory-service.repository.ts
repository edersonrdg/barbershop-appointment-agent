import { BarbershopService } from '../../domain/entities/barbershop-service';
import { ServiceNameAlreadyExistsError } from '../../domain/errors/service-name-already-exists.error';
import { ServiceDuration } from '../../domain/value-objects/service-duration';
import { ServicePrice } from '../../domain/value-objects/service-price';
import { ServiceRepository } from '../ports/service.repository.port';

// Stores snapshots, like a database would, so a use case that mutates an
// entity and then fails leaves the stored state untouched.
export class InMemoryServiceRepository implements ServiceRepository {
  private services: BarbershopService[] = [];

  listByBarbershop(barbershopId: string): Promise<BarbershopService[]> {
    return Promise.resolve(this.sortedOf(barbershopId).map(snapshot));
  }

  listActiveByBarbershop(barbershopId: string): Promise<BarbershopService[]> {
    return Promise.resolve(
      this.sortedOf(barbershopId)
        .filter((service) => service.active)
        .map(snapshot),
    );
  }

  findById(
    barbershopId: string,
    serviceId: string,
  ): Promise<BarbershopService | null> {
    const found = this.services.find(
      (service) =>
        service.barbershopId === barbershopId && service.id === serviceId,
    );
    return Promise.resolve(found ? snapshot(found) : null);
  }

  findByIds(
    barbershopId: string,
    serviceIds: readonly string[],
  ): Promise<BarbershopService[]> {
    return Promise.resolve(
      this.services
        .filter(
          (service) =>
            service.barbershopId === barbershopId &&
            serviceIds.includes(service.id),
        )
        .map(snapshot),
    );
  }

  create(service: BarbershopService): Promise<void> {
    if (this.nameTaken(service)) {
      return Promise.reject(new ServiceNameAlreadyExistsError());
    }
    this.services.push(snapshot(service));
    return Promise.resolve();
  }

  save(service: BarbershopService): Promise<void> {
    if (this.nameTaken(service)) {
      return Promise.reject(new ServiceNameAlreadyExistsError());
    }
    this.services = this.services.map((stored) =>
      stored.id === service.id && stored.barbershopId === service.barbershopId
        ? snapshot(service)
        : stored,
    );
    return Promise.resolve();
  }

  private sortedOf(barbershopId: string): BarbershopService[] {
    return this.services
      .filter((service) => service.barbershopId === barbershopId)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  private nameTaken(candidate: BarbershopService): boolean {
    return this.services.some(
      (stored) =>
        stored.barbershopId === candidate.barbershopId &&
        stored.id !== candidate.id &&
        stored.name.toLowerCase() === candidate.name.toLowerCase(),
    );
  }
}

function snapshot(service: BarbershopService): BarbershopService {
  return BarbershopService.restore({
    id: service.id,
    barbershopId: service.barbershopId,
    name: service.name,
    price: ServicePrice.create(service.priceCents),
    duration: ServiceDuration.create(service.durationMinutes),
    active: service.active,
    suggestedAddOnIds: [...service.suggestedAddOnIds],
    createdAt: service.createdAt,
  });
}

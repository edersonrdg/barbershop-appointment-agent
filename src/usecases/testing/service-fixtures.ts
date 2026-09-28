import { BarbershopService } from '../../domain/entities/barbershop-service';
import { ServiceDuration } from '../../domain/value-objects/service-duration';
import { ServicePrice } from '../../domain/value-objects/service-price';
import { InMemoryServiceRepository } from './in-memory-service.repository';

export const SERVICE_CREATED_AT = new Date('2026-09-27T12:00:00.000Z');

export interface ServiceState {
  id: string;
  barbershopId: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  suggestedAddOnIds: string[];
}

export function describeService(service: BarbershopService): ServiceState {
  return {
    id: service.id,
    barbershopId: service.barbershopId,
    name: service.name,
    priceCents: service.priceCents,
    durationMinutes: service.durationMinutes,
    active: service.active,
    suggestedAddOnIds: [...service.suggestedAddOnIds],
  };
}

export async function seedService(
  repository: InMemoryServiceRepository,
  state: Partial<ServiceState> & Pick<ServiceState, 'id' | 'name'>,
): Promise<BarbershopService> {
  const service = BarbershopService.restore({
    id: state.id,
    barbershopId: state.barbershopId ?? 'barbershop-a',
    name: state.name,
    price: ServicePrice.create(state.priceCents ?? 4500),
    duration: ServiceDuration.create(state.durationMinutes ?? 30),
    active: state.active ?? true,
    suggestedAddOnIds: state.suggestedAddOnIds ?? [],
    createdAt: SERVICE_CREATED_AT,
  });
  await repository.create(service);
  return service;
}

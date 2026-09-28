import {
  ADD_ON_NOT_FOUND_MESSAGE,
  BarbershopService,
} from '../../domain/entities/barbershop-service';
import { InvalidServiceAddOnError } from '../../domain/errors/invalid-service-add-on.error';
import { ServiceRepository } from '../ports/service.repository.port';

export async function applySuggestedAddOns(
  services: ServiceRepository,
  service: BarbershopService,
  addOnIds: readonly string[],
): Promise<void> {
  const found = await services.findByIds(service.barbershopId, addOnIds);
  const addOns: BarbershopService[] = [];
  for (const addOnId of addOnIds) {
    const addOn = found.find((candidate) => candidate.id === addOnId);
    if (!addOn) {
      throw new InvalidServiceAddOnError(ADD_ON_NOT_FOUND_MESSAGE);
    }
    addOns.push(addOn);
  }
  service.changeSuggestedAddOns(addOns);
}

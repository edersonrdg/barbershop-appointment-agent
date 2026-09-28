import {
  Barber,
  BARBER_SERVICE_NOT_FOUND_MESSAGE,
} from '../../domain/entities/barber';
import { BarbershopService } from '../../domain/entities/barbershop-service';
import { InvalidBarberServiceError } from '../../domain/errors/invalid-barber-service.error';
import { ServiceRepository } from '../ports/service.repository.port';

export async function assignBarberServices(
  services: ServiceRepository,
  barber: Barber,
  serviceIds: readonly string[],
): Promise<void> {
  const found = await services.findByIds(barber.barbershopId, serviceIds);
  const performed: BarbershopService[] = [];
  for (const serviceId of serviceIds) {
    const service = found.find((candidate) => candidate.id === serviceId);
    if (!service) {
      throw new InvalidBarberServiceError(BARBER_SERVICE_NOT_FOUND_MESSAGE);
    }
    performed.push(service);
  }
  barber.changeServices(performed);
}

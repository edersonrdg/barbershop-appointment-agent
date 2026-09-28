import { Barber } from '../../domain/entities/barber';
import { WeeklyOpeningHours } from '../../domain/value-objects/weekly-opening-hours';
import { WorkingHoursWarning } from '../../domain/value-objects/weekly-working-hours';
import { BarbershopRepository } from '../ports/barbershop.repository.port';

export interface SavedBarber {
  barber: Barber;
  warnings: WorkingHoursWarning[];
}

// CA-05.3: compared with the opening hours saved when the barber is saved.
export async function workingHoursWarnings(
  barbershops: BarbershopRepository,
  barber: Barber,
): Promise<WorkingHoursWarning[]> {
  const barbershop = await barbershops.findById(barber.barbershopId);
  const openingHours =
    barbershop?.openingHours ?? WeeklyOpeningHours.allClosed();
  return barber.workingHours.warningsAgainst(openingHours);
}

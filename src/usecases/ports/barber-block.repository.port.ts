import type {
  BarberBlock,
  BarberBlockKind,
} from '../../domain/entities/barber-block';
import { UtcPeriod } from '../../domain/entities/barbershop';
import { BusyPeriod } from './appointment.repository.port';

export const BARBER_BLOCK_REPOSITORY = Symbol('BarberBlockRepository');

export interface BarberBlockView {
  id: string;
  barber: { id: string; name: string };
  kind: BarberBlockKind;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}

export interface BarberBlockRepository {
  /**
   * The blocks and days off of the barbers among `barberIds` in the
   * barbershop whose `[start, end)` overlaps `range`; touching ones are left out.
   */
  listBusyPeriods(
    barbershopId: string,
    barberIds: readonly string[],
    range: UtcPeriod,
  ): Promise<BusyPeriod[]>;

  create(block: BarberBlock): Promise<void>;

  findById(barbershopId: string, id: string): Promise<BarberBlock | null>;

  delete(barbershopId: string, id: string): Promise<void>;

  /**
   * The blocks and days off of the barbershop that start in `[range.start,
   * range.end)`, only of `barberId` when it is not null, ordered by start,
   * case-insensitive barber name and id.
   */
  listStartingIn(
    barbershopId: string,
    range: UtcPeriod,
    barberId: string | null,
  ): Promise<BarberBlockView[]>;
}

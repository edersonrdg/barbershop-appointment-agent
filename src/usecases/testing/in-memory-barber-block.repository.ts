import { UtcPeriod } from '../../domain/entities/barbershop';
import { BusyPeriod } from '../ports/appointment.repository.port';
import { BarberBlockRepository } from '../ports/barber-block.repository.port';

interface StoredBlock extends BusyPeriod {
  barbershopId: string;
}

export class InMemoryBarberBlockRepository implements BarberBlockRepository {
  private blocks: StoredBlock[] = [];

  seed(block: StoredBlock): void {
    this.blocks.push({ ...block });
  }

  listBusyPeriods(
    barbershopId: string,
    barberIds: readonly string[],
    range: UtcPeriod,
  ): Promise<BusyPeriod[]> {
    return Promise.resolve(
      this.blocks
        .filter(
          (block) =>
            block.barbershopId === barbershopId &&
            barberIds.includes(block.barberId) &&
            block.start < range.end &&
            range.start < block.end,
        )
        .map(({ barberId, start, end }) => ({ barberId, start, end })),
    );
  }
}

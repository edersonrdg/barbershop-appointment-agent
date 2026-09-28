import {
  BarberBlock,
  BarberBlockProps,
} from '../../domain/entities/barber-block';
import { UtcPeriod } from '../../domain/entities/barbershop';
import { BusyPeriod } from '../ports/appointment.repository.port';
import {
  BarberBlockRepository,
  BarberBlockView,
} from '../ports/barber-block.repository.port';
import { BarberRepository } from '../ports/barber.repository.port';
import { InMemoryBarberRepository } from './in-memory-barber.repository';

interface SeededBlock extends BusyPeriod {
  barbershopId: string;
}

// Barber names come from the barber repository, like the SQL join does.
export class InMemoryBarberBlockRepository implements BarberBlockRepository {
  private blocks: BarberBlockProps[] = [];
  private seeded = 0;

  constructor(
    private readonly barbers: BarberRepository = new InMemoryBarberRepository(),
  ) {}

  seed(block: SeededBlock): void {
    this.seeded += 1;
    this.blocks.push({
      id: `seeded-block-${this.seeded}`,
      barbershopId: block.barbershopId,
      barberId: block.barberId,
      kind: 'block',
      startsAt: block.start,
      endsAt: block.end,
      reason: null,
      createdAt: block.start,
    });
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
            block.startsAt < range.end &&
            range.start < block.endsAt,
        )
        .map(({ barberId, startsAt, endsAt }) => ({
          barberId,
          start: startsAt,
          end: endsAt,
        })),
    );
  }

  create(block: BarberBlock): Promise<void> {
    this.blocks.push(propsOf(block));
    return Promise.resolve();
  }

  findById(barbershopId: string, id: string): Promise<BarberBlock | null> {
    const found = this.blocks.find(
      (block) => block.barbershopId === barbershopId && block.id === id,
    );
    return Promise.resolve(found ? BarberBlock.restore(found) : null);
  }

  delete(barbershopId: string, id: string): Promise<void> {
    this.blocks = this.blocks.filter(
      (block) => !(block.barbershopId === barbershopId && block.id === id),
    );
    return Promise.resolve();
  }

  async listStartingIn(
    barbershopId: string,
    range: UtcPeriod,
    barberId: string | null,
  ): Promise<BarberBlockView[]> {
    const views: BarberBlockView[] = [];
    for (const block of this.blocks) {
      if (block.barbershopId !== barbershopId) continue;
      if (block.startsAt < range.start || block.startsAt >= range.end) continue;
      if (barberId !== null && block.barberId !== barberId) continue;
      const barber = await this.barbers.findById(barbershopId, block.barberId);
      if (!barber) continue;
      views.push({
        id: block.id,
        barber: { id: barber.id, name: barber.name },
        kind: block.kind,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        reason: block.reason,
      });
    }
    return views.sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.barber.name
          .toLowerCase()
          .localeCompare(b.barber.name.toLowerCase()) ||
        a.id.localeCompare(b.id),
    );
  }
}

function propsOf(block: BarberBlock): BarberBlockProps {
  return {
    id: block.id,
    barbershopId: block.barbershopId,
    barberId: block.barberId,
    kind: block.kind,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    reason: block.reason,
    createdAt: block.createdAt,
  };
}

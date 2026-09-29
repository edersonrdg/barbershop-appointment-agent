import { UtcPeriod } from '../../domain/entities/barbershop';
import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';

export class InMemoryScheduleQuery implements ScheduleQuery {
  readonly calls: {
    barbershopId: string;
    range: UtcPeriod;
    barberId: string | null;
  }[] = [];
  readonly overlappingCalls: {
    barbershopId: string;
    barberId: string;
    range: UtcPeriod;
  }[] = [];
  private readonly stored: { barbershopId: string; entry: ScheduleEntry }[] =
    [];

  seed(
    barbershopId: string,
    entry: Pick<ScheduleEntry, 'id' | 'startsAt'> & {
      barber: ScheduleEntry['barber'];
    },
  ): void {
    this.stored.push({
      barbershopId,
      entry: {
        client: null,
        services: [{ id: 'haircut', name: 'Corte' }],
        endsAt: new Date(entry.startsAt.getTime() + 30 * 60 * 1000),
        status: 'confirmed',
        origin: 'manual',
        ...entry,
      },
    });
  }

  listStartingIn(
    barbershopId: string,
    range: UtcPeriod,
    barberId: string | null,
  ): Promise<ScheduleEntry[]> {
    this.calls.push({ barbershopId, range, barberId });
    return Promise.resolve(
      this.stored
        .filter(
          ({ barbershopId: tenant, entry }) =>
            tenant === barbershopId &&
            entry.startsAt >= range.start &&
            entry.startsAt < range.end &&
            (barberId === null || entry.barber.id === barberId),
        )
        .map(({ entry }) => entry)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    );
  }

  listOverlapping(
    barbershopId: string,
    barberId: string,
    range: UtcPeriod,
  ): Promise<ScheduleEntry[]> {
    this.overlappingCalls.push({ barbershopId, barberId, range });
    return Promise.resolve(
      this.stored
        .filter(
          ({ barbershopId: tenant, entry }) =>
            tenant === barbershopId &&
            entry.barber.id === barberId &&
            entry.status === 'confirmed' &&
            entry.startsAt < range.end &&
            range.start < entry.endsAt,
        )
        .map(({ entry }) => entry)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    );
  }

  findById(
    barbershopId: string,
    appointmentId: string,
  ): Promise<ScheduleEntry | null> {
    const found = this.stored.find(
      ({ barbershopId: tenant, entry }) =>
        tenant === barbershopId && entry.id === appointmentId,
    );
    return Promise.resolve(found?.entry ?? null);
  }
}

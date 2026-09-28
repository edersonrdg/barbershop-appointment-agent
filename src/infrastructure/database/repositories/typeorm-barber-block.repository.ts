import { DataSource, In, LessThan, MoreThan } from 'typeorm';
import { UtcPeriod } from '../../../domain/entities/barbershop';
import { BusyPeriod } from '../../../usecases/ports/appointment.repository.port';
import { BarberBlockRepository } from '../../../usecases/ports/barber-block.repository.port';
import { BarberBlockEntity } from '../entities/barber-block.entity';

export class TypeOrmBarberBlockRepository implements BarberBlockRepository {
  constructor(private readonly dataSource: DataSource) {}

  async listBusyPeriods(
    barbershopId: string,
    barberIds: readonly string[],
    range: UtcPeriod,
  ): Promise<BusyPeriod[]> {
    if (barberIds.length === 0) return [];
    const rows = await this.dataSource.getRepository(BarberBlockEntity).find({
      where: {
        barbershopId,
        barberId: In([...barberIds]),
        startsAt: LessThan(range.end),
        endsAt: MoreThan(range.start),
      },
      order: { startsAt: 'ASC' },
    });
    return rows.map((row) => ({
      barberId: row.barberId,
      start: row.startsAt,
      end: row.endsAt,
    }));
  }
}

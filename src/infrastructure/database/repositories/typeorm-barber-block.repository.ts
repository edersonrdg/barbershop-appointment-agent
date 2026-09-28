import { DataSource, In, LessThan, MoreThan } from 'typeorm';
import {
  BarberBlock,
  BarberBlockKind,
} from '../../../domain/entities/barber-block';
import { UtcPeriod } from '../../../domain/entities/barbershop';
import { BusyPeriod } from '../../../usecases/ports/appointment.repository.port';
import {
  BarberBlockRepository,
  BarberBlockView,
} from '../../../usecases/ports/barber-block.repository.port';
import { BarberBlockEntity } from '../entities/barber-block.entity';

interface BlockViewRow {
  id: string;
  barber_id: string;
  barber_name: string;
  kind: BarberBlockKind;
  starts_at: Date;
  ends_at: Date;
  reason: string | null;
}

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

  async create(block: BarberBlock): Promise<void> {
    await this.dataSource.getRepository(BarberBlockEntity).insert({
      id: block.id,
      barbershopId: block.barbershopId,
      barberId: block.barberId,
      kind: block.kind,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      reason: block.reason,
      createdAt: block.createdAt,
    });
  }

  async findById(
    barbershopId: string,
    id: string,
  ): Promise<BarberBlock | null> {
    const row = await this.dataSource
      .getRepository(BarberBlockEntity)
      .findOneBy({ barbershopId, id });
    if (!row) return null;
    return BarberBlock.restore({
      id: row.id,
      barbershopId: row.barbershopId,
      barberId: row.barberId,
      kind: row.kind,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      reason: row.reason,
      createdAt: row.createdAt,
    });
  }

  async delete(barbershopId: string, id: string): Promise<void> {
    await this.dataSource
      .getRepository(BarberBlockEntity)
      .delete({ barbershopId, id });
  }

  // The join also matches barbershop_id, so a row of another barbershop never
  // reaches the list (RN-26).
  async listStartingIn(
    barbershopId: string,
    range: UtcPeriod,
    barberId: string | null,
  ): Promise<BarberBlockView[]> {
    const rows = await this.dataSource.query<BlockViewRow[]>(
      `SELECT k.id, k.kind, k.starts_at, k.ends_at, k.reason,
              b.id AS barber_id, b.name AS barber_name
       FROM barber_blocks k
       JOIN barbers b ON b.id = k.barber_id AND b.barbershop_id = k.barbershop_id
       WHERE k.barbershop_id = $1
         AND k.starts_at >= $2 AND k.starts_at < $3
         AND ($4::uuid IS NULL OR k.barber_id = $4::uuid)
       ORDER BY k.starts_at, lower(b.name), k.id`,
      [barbershopId, range.start, range.end, barberId],
    );
    return rows.map((row) => ({
      id: row.id,
      barber: { id: row.barber_id, name: row.barber_name },
      kind: row.kind,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reason: row.reason,
    }));
  }
}

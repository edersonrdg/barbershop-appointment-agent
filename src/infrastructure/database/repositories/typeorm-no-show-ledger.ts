import { DataSource } from 'typeorm';
import { NoShowLedger } from '../../../usecases/ports/no-show-ledger.port';

export class TypeOrmNoShowLedger implements NoShowLedger {
  constructor(private readonly dataSource: DataSource) {}

  async countFor(barbershopId: string, clientId: string): Promise<number> {
    const [row] = await this.dataSource.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count
         FROM appointments a
         JOIN clients c ON c.id = a.client_id AND c.barbershop_id = a.barbershop_id
        WHERE a.barbershop_id = $1
          AND a.client_id = $2
          AND a.status = 'no_show'
          AND (c.no_show_reset_at IS NULL OR a.starts_at > c.no_show_reset_at)`,
      [barbershopId, clientId],
    );
    return row.count;
  }

  async resetExpired(
    barbershopId: string,
    cutoff: Date,
    now: Date,
  ): Promise<number> {
    const [, affected] = await this.dataSource.query<[unknown, number]>(
      `UPDATE clients c
          SET no_show_reset_at = $3
        WHERE c.barbershop_id = $1
          AND (
            SELECT MAX(a.starts_at)
              FROM appointments a
             WHERE a.barbershop_id = c.barbershop_id
               AND a.client_id = c.id
               AND a.status = 'no_show'
               AND (c.no_show_reset_at IS NULL OR a.starts_at > c.no_show_reset_at)
          ) <= $2`,
      [barbershopId, cutoff, now],
    );
    return affected;
  }
}

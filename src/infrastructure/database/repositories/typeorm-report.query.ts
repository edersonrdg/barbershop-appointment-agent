import { DataSource } from 'typeorm';
import { UtcPeriod } from '../../../domain/entities/barbershop';
import {
  AppointmentTotals,
  ReportQuery,
} from '../../../usecases/get-barbershop-report/report.query.port';

interface TotalsRow {
  total: number;
  cancelled: number;
  no_shows: number;
  booked_by_bot: number;
  attended_revenue_cents: string;
}

// The services join also matches barbershop_id, so a price of another
// barbershop never reaches the revenue (RN-26).
export class TypeOrmReportQuery implements ReportQuery {
  constructor(private readonly dataSource: DataSource) {}

  async totalsStartingIn(
    barbershopId: string,
    range: UtcPeriod,
    barberId: string | null,
  ): Promise<AppointmentTotals> {
    const [row] = await this.dataSource.query<TotalsRow[]>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
              count(*) FILTER (WHERE a.status = 'no_show')::int AS no_shows,
              count(*) FILTER (WHERE a.origin = 'bot')::int AS booked_by_bot,
              coalesce(sum(r.cents) FILTER (WHERE a.status = 'attended'), 0) AS attended_revenue_cents
       FROM appointments a
       LEFT JOIN LATERAL (
         SELECT sum(s.price_cents) AS cents
         FROM appointment_services aps
         JOIN services s ON s.id = aps.service_id AND s.barbershop_id = aps.barbershop_id
         WHERE aps.appointment_id = a.id AND aps.barbershop_id = a.barbershop_id
       ) r ON true
       WHERE a.barbershop_id = $1
         AND a.starts_at >= $2 AND a.starts_at < $3
         AND ($4::uuid IS NULL OR a.barber_id = $4::uuid)`,
      [barbershopId, range.start, range.end, barberId],
    );
    return {
      total: row.total,
      cancelled: row.cancelled,
      noShows: row.no_shows,
      bookedByBot: row.booked_by_bot,
      attendedRevenueCents: Number(row.attended_revenue_cents),
    };
  }
}

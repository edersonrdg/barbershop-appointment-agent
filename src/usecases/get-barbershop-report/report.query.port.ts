import { UtcPeriod } from '../../domain/entities/barbershop';

export const REPORT_QUERY = Symbol('ReportQuery');

export interface AppointmentTotals {
  total: number;
  cancelled: number;
  noShows: number;
  bookedByBot: number;
  /** Current price of every service of the attended appointments (RF-38). */
  attendedRevenueCents: number;
}

export interface ReportQuery {
  /**
   * Totals over the appointments of the barbershop that start in
   * `[range.start, range.end)`, every status, only of `barberId` when it is
   * not null.
   */
  totalsStartingIn(
    barbershopId: string,
    range: UtcPeriod,
    barberId: string | null,
  ): Promise<AppointmentTotals>;
}

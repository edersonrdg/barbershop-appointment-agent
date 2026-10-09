import { UtcPeriod } from '../../domain/entities/barbershop';
import {
  AppointmentTotals,
  ReportQuery,
} from '../get-barbershop-report/report.query.port';
import { InMemoryAppointmentRepository } from './in-memory-appointment.repository';
import { InMemoryServiceRepository } from './in-memory-service.repository';

// Reads the same appointments and current service prices the SQL joins.
export class InMemoryReportQuery implements ReportQuery {
  constructor(
    private readonly appointments: InMemoryAppointmentRepository,
    private readonly services: InMemoryServiceRepository,
  ) {}

  async totalsStartingIn(
    barbershopId: string,
    range: UtcPeriod,
    barberId: string | null,
  ): Promise<AppointmentTotals> {
    const inRange = (await this.appointments.list(barbershopId)).filter(
      (appointment) =>
        appointment.startsAt >= range.start &&
        appointment.startsAt < range.end &&
        (barberId === null || appointment.barberId === barberId),
    );
    let attendedRevenueCents = 0;
    for (const appointment of inRange) {
      if (appointment.status !== 'attended') continue;
      const services = await this.services.findByIds(
        barbershopId,
        appointment.serviceIds,
      );
      for (const service of services) {
        attendedRevenueCents += service.priceCents;
      }
    }
    const count = (keep: (status: string, origin: string) => boolean) =>
      inRange.filter((appointment) =>
        keep(appointment.status, appointment.origin),
      ).length;
    return {
      total: inRange.length,
      cancelled: count((status) => status === 'cancelled'),
      noShows: count((status) => status === 'no_show'),
      bookedByBot: count((_, origin) => origin === 'bot'),
      attendedRevenueCents,
    };
  }
}

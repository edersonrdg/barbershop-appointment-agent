import { Barber } from '../../domain/entities/barber';
import { Barbershop, UtcPeriod } from '../../domain/entities/barbershop';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import {
  BarberDaySchedule,
  DayOccupancy,
} from '../../domain/value-objects/barber-day-schedule';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { addCalendarDays } from '../../domain/value-objects/calendar-date';
import { TimeOfDay } from '../../domain/value-objects/time-of-day';
import {
  AppointmentRepository,
  BusyPeriod,
} from '../ports/appointment.repository.port';
import { BarberBlockRepository } from '../ports/barber-block.repository.port';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { ReportQuery } from './report.query.port';

const MIDNIGHT = TimeOfDay.create('00:00');

export interface GetBarbershopReportInput {
  barbershopId: string;
  /** Local dates of the barbershop, `YYYY-MM-DD`, both included. */
  from: string;
  to: string;
  barberId?: string;
}

export interface BarbershopReport {
  from: string;
  to: string;
  barberId: string | null;
  totalAppointments: number;
  cancellations: number;
  noShows: number;
  /** 0 to 100 with one decimal; null without available minutes. */
  occupancyPercent: number | null;
  estimatedRevenueCents: number;
  /** 0 to 100 with one decimal; null without appointments. */
  botBookedPercent: number | null;
}

export class GetBarbershopReportUseCase {
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly barbers: BarberRepository,
    private readonly appointments: AppointmentRepository,
    private readonly blocks: BarberBlockRepository,
    private readonly reports: ReportQuery,
  ) {}

  async execute(input: GetBarbershopReportInput): Promise<BarbershopReport> {
    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new InvalidCredentialsError();
    }
    const barberId = input.barberId ?? null;
    const barbers = await this.barbersInScope(input.barbershopId, barberId);
    const timezone = BarbershopTimezone.create(barbershop.timezone);
    const range: UtcPeriod = {
      start: timezone.toUtc(input.from, MIDNIGHT),
      end: timezone.toUtc(addCalendarDays(input.to, 1), MIDNIGHT),
    };
    const totals = await this.reports.totalsStartingIn(
      input.barbershopId,
      range,
      barberId,
    );
    const occupancy = await this.occupancyOf(
      barbershop,
      timezone,
      barbers,
      input,
      range,
    );
    return {
      from: input.from,
      to: input.to,
      barberId,
      totalAppointments: totals.total,
      cancellations: totals.cancelled,
      noShows: totals.noShows,
      occupancyPercent: percentOf(
        occupancy.bookedMinutes,
        occupancy.availableMinutes,
      ),
      estimatedRevenueCents: totals.attendedRevenueCents,
      botBookedPercent: percentOf(totals.bookedByBot, totals.total),
    };
  }

  private async barbersInScope(
    barbershopId: string,
    barberId: string | null,
  ): Promise<Barber[]> {
    if (barberId === null) {
      return this.barbers.listByBarbershop(barbershopId);
    }
    const barber = await this.barbers.findById(barbershopId, barberId);
    if (!barber) {
      throw new BarberNotFoundError();
    }
    return [barber];
  }

  // US-26: capacity is the same available time the availability engine
  // offers (US-07), with the current hours; an inactive barber offers none.
  private async occupancyOf(
    barbershop: Barbershop,
    timezone: BarbershopTimezone,
    barbers: readonly Barber[],
    input: GetBarbershopReportInput,
    range: UtcPeriod,
  ): Promise<DayOccupancy> {
    const active = barbers.filter((barber) => barber.active);
    const sum: DayOccupancy = { availableMinutes: 0, bookedMinutes: 0 };
    if (active.length === 0) return sum;
    const ids = active.map((barber) => barber.id);
    const [appointments, blocks] = await Promise.all([
      this.appointments.listBusyPeriods(barbershop.id, ids, range),
      this.blocks.listBusyPeriods(barbershop.id, ids, range),
    ]);
    for (
      let date = input.from;
      date <= input.to;
      date = addCalendarDays(date, 1)
    ) {
      const openPeriods = barbershop.openIntervalsOn(date);
      for (const barber of active) {
        const day = BarberDaySchedule.create({
          barberId: barber.id,
          openPeriods,
          workPeriods: barber.workIntervalsOn(date, timezone),
          blocks: periodsOf(blocks, barber.id),
          appointments: periodsOf(appointments, barber.id),
        }).occupancy();
        sum.availableMinutes += day.availableMinutes;
        sum.bookedMinutes += day.bookedMinutes;
      }
    }
    return sum;
  }
}

function periodsOf(busy: readonly BusyPeriod[], barberId: string): UtcPeriod[] {
  return busy
    .filter((period) => period.barberId === barberId)
    .map(({ start, end }) => ({ start, end }));
}

function percentOf(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part * 1000) / whole) / 10;
}

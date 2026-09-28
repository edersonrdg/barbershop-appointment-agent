import { AppointmentOrigin } from '../../domain/entities/appointment';
import { Barber } from '../../domain/entities/barber';
import { AvailableSlot } from '../../domain/value-objects/barber-day-schedule';
import { AppointmentRepository } from '../ports/appointment.repository.port';
import { BarberBlockRepository } from '../ports/barber-block.repository.port';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { Clock } from '../ports/clock.port';
import { ServiceRepository } from '../ports/service.repository.port';
import {
  buildDaySchedules,
  loadBookableBarber,
  loadBookingContext,
  performsAll,
  SchedulingPorts,
} from '../shared/booking-context';

export interface ListAvailableSlotsInput {
  barbershopId: string;
  /** `null` means any barber who performs every requested service. */
  barberId: string | null;
  serviceIds: readonly string[];
  /** Local date of the barbershop, `YYYY-MM-DD`. */
  date: string;
  origin: AppointmentOrigin;
}

export class ListAvailableSlotsUseCase {
  private readonly ports: SchedulingPorts;

  constructor(
    barbershops: BarbershopRepository,
    bookingRules: BookingRulesRepository,
    barbers: BarberRepository,
    services: ServiceRepository,
    appointments: AppointmentRepository,
    blocks: BarberBlockRepository,
    clock: Clock,
  ) {
    this.ports = {
      barbershops,
      bookingRules,
      barbers,
      services,
      appointments,
      blocks,
      clock,
    };
  }

  async execute(input: ListAvailableSlotsInput): Promise<AvailableSlot[]> {
    const context = await loadBookingContext(this.ports, input);
    const barbers = await this.barbersFor(input);
    const schedules = await buildDaySchedules(
      this.ports,
      context,
      barbers,
      input.date,
    );
    // CA-07.2: barbers come in name order, so the first one kept for a start
    // is the first free barber by name (AVL-11).
    const byStart = new Map<number, AvailableSlot>();
    for (const schedule of schedules) {
      for (const slot of schedule.offer(
        context.durationMinutes,
        context.earliest,
      )) {
        const key = slot.startsAt.getTime();
        if (!byStart.has(key)) byStart.set(key, slot);
      }
    }
    return [...byStart.values()].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );
  }

  private async barbersFor(input: ListAvailableSlotsInput): Promise<Barber[]> {
    if (input.barberId !== null) {
      return [
        await loadBookableBarber(
          this.ports.barbers,
          input.barbershopId,
          input.barberId,
          input.serviceIds,
        ),
      ];
    }
    const active = await this.ports.barbers.listActiveByBarbershop(
      input.barbershopId,
    );
    return active.filter((barber) => performsAll(barber, input.serviceIds));
  }
}

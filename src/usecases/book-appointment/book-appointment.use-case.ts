import {
  Appointment,
  AppointmentOrigin,
} from '../../domain/entities/appointment';
import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { BarberUnavailableError } from '../../domain/errors/barber-unavailable.error';
import { DomainError } from '../../domain/errors/domain.error';
import { InvalidValueError } from '../../domain/errors/invalid-value.error';
import { MinimumAdvanceNotMetError } from '../../domain/errors/minimum-advance-not-met.error';
import { OutsideOpeningHoursError } from '../../domain/errors/outside-opening-hours.error';
import { OutsideWorkingHoursError } from '../../domain/errors/outside-working-hours.error';
import { SlotInPastError } from '../../domain/errors/slot-in-past.error';
import { ScheduleViolation } from '../../domain/value-objects/barber-day-schedule';
import { AppointmentMetrics } from '../ports/appointment-metrics.port';
import { AppointmentRepository } from '../ports/appointment.repository.port';
import { BarberBlockRepository } from '../ports/barber-block.repository.port';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { Clock } from '../ports/clock.port';
import { IdGenerator } from '../ports/id-generator.port';
import { ServiceRepository } from '../ports/service.repository.port';
import {
  buildDaySchedules,
  loadBookableBarber,
  loadBookingContext,
  SchedulingPorts,
} from '../shared/booking-context';

const MS_PER_MINUTE = 60 * 1000;

export interface BookAppointmentInput {
  barbershopId: string;
  barberId: string;
  serviceIds: readonly string[];
  startsAt: Date;
  origin: AppointmentOrigin;
}

export class BookAppointmentUseCase {
  private readonly ports: SchedulingPorts;

  constructor(
    barbershops: BarbershopRepository,
    bookingRules: BookingRulesRepository,
    barbers: BarberRepository,
    services: ServiceRepository,
    appointments: AppointmentRepository,
    blocks: BarberBlockRepository,
    clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly metrics: AppointmentMetrics,
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

  // CA-07.5: the checks run in the order of AVL-25, so the reported rule is
  // always the first one broken.
  async execute(input: BookAppointmentInput): Promise<Appointment> {
    if (input.startsAt.getTime() % MS_PER_MINUTE !== 0) {
      throw new InvalidValueError('Horário inválido.');
    }
    const context = await loadBookingContext(this.ports, input);
    const barber = await loadBookableBarber(
      this.ports.barbers,
      input.barbershopId,
      input.barberId,
      input.serviceIds,
    );
    if (input.startsAt < context.now) {
      throw new SlotInPastError();
    }
    if (input.origin === 'bot' && input.startsAt < context.earliest) {
      throw new MinimumAdvanceNotMetError(context.minimumAdvanceMinutes);
    }
    const appointment = Appointment.book({
      id: this.idGenerator.next(),
      barbershopId: input.barbershopId,
      barberId: barber.id,
      clientId: null,
      serviceIds: input.serviceIds,
      startsAt: input.startsAt,
      durationMinutes: context.durationMinutes,
      origin: input.origin,
      now: context.now,
    });
    const [schedule] = await buildDaySchedules(
      this.ports,
      context,
      [barber],
      context.timezone.localDateOf(input.startsAt),
    );
    const violation = schedule.violationOf({
      start: appointment.startsAt,
      end: appointment.endsAt,
    });
    if (violation === 'overlap') {
      this.metrics.conflict(input.origin);
      throw new AppointmentConflictError('RN-03');
    }
    if (violation) {
      throw refusalOf(violation);
    }
    try {
      await this.ports.appointments.create(appointment);
    } catch (error) {
      if (error instanceof AppointmentConflictError) {
        this.metrics.conflict(input.origin);
      }
      throw error;
    }
    this.metrics.booked(input.origin);
    return appointment;
  }
}

function refusalOf(
  violation: Exclude<ScheduleViolation, 'overlap'>,
): DomainError {
  switch (violation) {
    case 'outside-opening-hours':
      return new OutsideOpeningHoursError();
    case 'outside-working-hours':
      return new OutsideWorkingHoursError();
    case 'blocked':
      return new BarberUnavailableError();
  }
}

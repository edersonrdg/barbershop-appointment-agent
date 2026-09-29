import { AttendanceStatus } from '../../domain/entities/appointment';
import { AppointmentNotFoundError } from '../../domain/errors/appointment-not-found.error';
import { AppointmentRepository } from '../ports/appointment.repository.port';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { Clock } from '../ports/clock.port';
import { NoShowLedger } from '../ports/no-show-ledger.port';
import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';
import { clientNoShowStatus } from '../shared/client-no-show-status';
import {
  BarberAccessPolicy,
  BarberAccessRequest,
} from '../shared/barber-access-policy';

export type MarkAttendanceInput = BarberAccessRequest & {
  appointmentId: string;
  status: AttendanceStatus;
};

export interface AttendanceClientSummary {
  id: string;
  noShowCount: number;
  selfBookingBlocked: boolean;
}

export interface MarkAttendanceResult {
  appointment: ScheduleEntry;
  client: AttendanceClientSummary | null;
}

export class MarkAttendanceUseCase {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly access: BarberAccessPolicy,
    private readonly ledger: NoShowLedger,
    private readonly bookingRules: BookingRulesRepository,
    private readonly schedule: ScheduleQuery,
    private readonly clock: Clock,
  ) {}

  async execute(input: MarkAttendanceInput): Promise<MarkAttendanceResult> {
    const stored = await this.appointments.findById(
      input.barbershopId,
      input.appointmentId,
    );
    if (!stored) {
      throw new AppointmentNotFoundError();
    }
    await this.access.assertCanManage({ ...input, barberId: stored.barberId });
    const marked = stored.markAttendance(input.status, this.clock.now());
    if (marked.status !== stored.status) {
      await this.appointments.saveStatus(marked);
    }
    const entry = await this.schedule.findById(input.barbershopId, marked.id);
    if (!entry) {
      throw new Error('The marked appointment was not found.');
    }
    return {
      appointment: entry,
      client: marked.clientId
        ? await this.clientSummary(input.barbershopId, marked.clientId)
        : null,
    };
  }

  private async clientSummary(
    barbershopId: string,
    clientId: string,
  ): Promise<AttendanceClientSummary> {
    return {
      id: clientId,
      ...(await clientNoShowStatus(
        this.ledger,
        this.bookingRules,
        barbershopId,
        clientId,
      )),
    };
  }
}

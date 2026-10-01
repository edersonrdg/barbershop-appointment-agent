import { AppointmentCancelledError } from '../errors/appointment-cancelled.error';
import { AppointmentNotConfirmedError } from '../errors/appointment-not-confirmed.error';
import { AppointmentNotStartedError } from '../errors/appointment-not-started.error';

const MS_PER_MINUTE = 60 * 1000;

export type AppointmentOrigin = 'bot' | 'manual';

export type AppointmentStatus =
  'confirmed' | 'attended' | 'no_show' | 'cancelled';

export type AttendanceStatus = Exclude<
  AppointmentStatus,
  'confirmed' | 'cancelled'
>;

export interface AppointmentProps {
  id: string;
  barbershopId: string;
  barberId: string;
  clientId: string | null;
  serviceIds: string[];
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  createdAt: Date;
}

export class Appointment {
  private constructor(private readonly props: AppointmentProps) {}

  static book({
    id,
    barbershopId,
    barberId,
    clientId,
    serviceIds,
    startsAt,
    durationMinutes,
    origin,
    now,
  }: {
    id: string;
    barbershopId: string;
    barberId: string;
    clientId: string | null;
    serviceIds: readonly string[];
    startsAt: Date;
    durationMinutes: number;
    origin: AppointmentOrigin;
    now: Date;
  }): Appointment {
    return new Appointment({
      id,
      barbershopId,
      barberId,
      clientId,
      serviceIds: [...serviceIds],
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMinutes * MS_PER_MINUTE),
      status: 'confirmed',
      origin,
      createdAt: now,
    });
  }

  static restore(props: AppointmentProps): Appointment {
    return new Appointment({ ...props, serviceIds: [...props.serviceIds] });
  }

  // RF-27: attendance is recorded once the appointment has started, and a
  // wrong mark can be corrected between attended and no_show (CA-11.4).
  markAttendance(status: AttendanceStatus, now: Date): Appointment {
    if (this.props.status === 'cancelled') {
      throw new AppointmentCancelledError();
    }
    if (now < this.props.startsAt) {
      throw new AppointmentNotStartedError();
    }
    if (status === this.props.status) {
      return this;
    }
    return Appointment.restore({ ...this.props, status });
  }

  // US-18: only a confirmed appointment is cancelled; leaving the statuses
  // that hold the slot is what frees it (RN-03, CA-18.5).
  cancel(): Appointment {
    if (this.props.status !== 'confirmed') {
      throw new AppointmentNotConfirmedError();
    }
    return Appointment.restore({ ...this.props, status: 'cancelled' });
  }

  get id(): string {
    return this.props.id;
  }

  get barbershopId(): string {
    return this.props.barbershopId;
  }

  get barberId(): string {
    return this.props.barberId;
  }

  get clientId(): string | null {
    return this.props.clientId;
  }

  get serviceIds(): readonly string[] {
    return this.props.serviceIds;
  }

  get startsAt(): Date {
    return this.props.startsAt;
  }

  get endsAt(): Date {
    return this.props.endsAt;
  }

  get status(): AppointmentStatus {
    return this.props.status;
  }

  get origin(): AppointmentOrigin {
    return this.props.origin;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}

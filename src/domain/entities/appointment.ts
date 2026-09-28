const MS_PER_MINUTE = 60 * 1000;

export type AppointmentOrigin = 'bot' | 'manual';

// RN-01: only confirmed appointments exist until US-11 and US-18.
export type AppointmentStatus = 'confirmed';

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

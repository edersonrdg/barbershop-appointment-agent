import {
  Appointment,
  AppointmentProps,
  AppointmentStatus,
} from '../../domain/entities/appointment';
import { UtcPeriod } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { ClientPhoneTakenError } from '../../domain/errors/client-phone-taken.error';
import { ReminderKind } from '../../domain/value-objects/appointment-reminder';
import {
  AppointmentRepository,
  BusyPeriod,
} from '../ports/appointment.repository.port';
import { InMemoryClientRepository } from './in-memory-client.repository';

const SLOT_HOLDING_STATUSES: readonly AppointmentStatus[] = [
  'confirmed',
  'attended',
  'no_show',
];

/** US-19: the instants stored beside the appointment (door 1). */
export interface AppointmentMarks {
  reminder24hSentAt: Date | null;
  reminder1hSentAt: Date | null;
  clientConfirmedAt: Date | null;
  /** US-25: when the return reminder of the attended appointment went out. */
  returnReminderSentAt: Date | null;
}

const NO_MARKS: AppointmentMarks = {
  reminder24hSentAt: null,
  reminder1hSentAt: null,
  clientConfirmedAt: null,
  returnReminderSentAt: null,
};

const REMINDER_MARKS: Record<ReminderKind, keyof AppointmentMarks> = {
  '24h': 'reminder24hSentAt',
  '1h': 'reminder1hSentAt',
};

// Stores snapshots and refuses overlapping appointments of the same barber
// that hold the slot (RN-03), like the database exclusion constraint does. The new client is
// stored only when the appointment is, as in the database transaction.
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private appointments: Appointment[] = [];
  private racingClients: Client[] = [];
  private readonly marks = new Map<string, AppointmentMarks>();

  constructor(
    private readonly clients: InMemoryClientRepository = new InMemoryClientRepository(),
  ) {}

  /**
   * Simulates another request storing `client` between the phone lookup and
   * the next `create` (RN-08 race).
   */
  storeClientBeforeNextCreate(client: Client): void {
    this.racingClients.push(client);
  }

  seed({
    barbershopId,
    barberId,
    start,
    end,
  }: {
    barbershopId: string;
    barberId: string;
    start: Date;
    end: Date;
  }): void {
    this.appointments.push(
      Appointment.restore({
        id: `seeded-${this.appointments.length + 1}`,
        barbershopId,
        barberId,
        clientId: null,
        serviceIds: ['haircut'],
        startsAt: start,
        endsAt: end,
        status: 'confirmed',
        origin: 'manual',
        createdAt: start,
      }),
    );
  }

  create(
    appointment: Appointment,
    newClient: Client | null = null,
  ): Promise<void> {
    for (const racing of this.racingClients.splice(0)) {
      this.clients.add(racing);
    }
    const overlapping = this.appointments.some(
      (stored) =>
        SLOT_HOLDING_STATUSES.includes(stored.status) &&
        stored.barbershopId === appointment.barbershopId &&
        stored.barberId === appointment.barberId &&
        stored.startsAt < appointment.endsAt &&
        appointment.startsAt < stored.endsAt,
    );
    if (overlapping) {
      return Promise.reject(new AppointmentConflictError('RN-07'));
    }
    if (newClient) {
      const taken = this.clients
        .list(newClient.barbershopId)
        .some((client) => client.phone === newClient.phone);
      if (taken) {
        return Promise.reject(new ClientPhoneTakenError());
      }
      this.clients.add(newClient);
    }
    this.appointments.push(snapshot(appointment));
    return Promise.resolve();
  }

  list(barbershopId: string): Promise<Appointment[]> {
    return Promise.resolve(
      this.appointments
        .filter((appointment) => appointment.barbershopId === barbershopId)
        .map(snapshot),
    );
  }

  findById(
    barbershopId: string,
    appointmentId: string,
  ): Promise<Appointment | null> {
    const stored = this.appointments.find(
      (appointment) =>
        appointment.id === appointmentId &&
        appointment.barbershopId === barbershopId,
    );
    return Promise.resolve(stored ? snapshot(stored) : null);
  }

  saveStatus(appointment: Appointment): Promise<void> {
    this.appointments = this.appointments.map((stored) =>
      stored.id === appointment.id &&
      stored.barbershopId === appointment.barbershopId
        ? Appointment.restore({
            ...toProps(stored),
            status: appointment.status,
          })
        : stored,
    );
    return Promise.resolve();
  }

  marksOf(barbershopId: string, appointmentId: string): AppointmentMarks {
    return {
      ...(this.marks.get(`${barbershopId}:${appointmentId}`) ?? NO_MARKS),
    };
  }

  setMarks(
    barbershopId: string,
    appointmentId: string,
    marks: Partial<AppointmentMarks>,
  ): void {
    this.marks.set(`${barbershopId}:${appointmentId}`, {
      ...this.marksOf(barbershopId, appointmentId),
      ...marks,
    });
  }

  claimReminder(
    barbershopId: string,
    appointmentId: string,
    kind: ReminderKind,
    now: Date,
  ): Promise<boolean> {
    const mark = REMINDER_MARKS[kind];
    return Promise.resolve(
      this.markIf(barbershopId, appointmentId, mark, now, () => true),
    );
  }

  confirmByClient(
    barbershopId: string,
    appointmentId: string,
    now: Date,
  ): Promise<boolean> {
    return Promise.resolve(
      this.markIf(
        barbershopId,
        appointmentId,
        'clientConfirmedAt',
        now,
        (marks) => marks.reminder24hSentAt !== null,
      ),
    );
  }

  claimReturnReminder(
    barbershopId: string,
    appointmentId: string,
    now: Date,
  ): Promise<boolean> {
    return Promise.resolve(
      this.markIf(
        barbershopId,
        appointmentId,
        'returnReminderSentAt',
        now,
        () => true,
        'attended',
      ),
    );
  }

  // Same guards as the conditional UPDATE of the database (door 1).
  private markIf(
    barbershopId: string,
    appointmentId: string,
    mark: keyof AppointmentMarks,
    now: Date,
    condition: (marks: AppointmentMarks) => boolean,
    status: AppointmentStatus = 'confirmed',
  ): boolean {
    const stored = this.appointments.find(
      (appointment) =>
        appointment.id === appointmentId &&
        appointment.barbershopId === barbershopId,
    );
    const marks = this.marksOf(barbershopId, appointmentId);
    if (
      stored?.status !== status ||
      marks[mark] !== null ||
      !condition(marks)
    ) {
      return false;
    }
    this.setMarks(barbershopId, appointmentId, { [mark]: now });
    return true;
  }

  listBusyPeriods(
    barbershopId: string,
    barberIds: readonly string[],
    range: UtcPeriod,
  ): Promise<BusyPeriod[]> {
    return Promise.resolve(
      this.appointments
        .filter(
          (appointment) =>
            appointment.barbershopId === barbershopId &&
            SLOT_HOLDING_STATUSES.includes(appointment.status) &&
            barberIds.includes(appointment.barberId) &&
            appointment.startsAt < range.end &&
            range.start < appointment.endsAt,
        )
        .map((appointment) => ({
          barberId: appointment.barberId,
          start: appointment.startsAt,
          end: appointment.endsAt,
        })),
    );
  }
}

function snapshot(appointment: Appointment): Appointment {
  return Appointment.restore(toProps(appointment));
}

function toProps(appointment: Appointment): AppointmentProps {
  return {
    id: appointment.id,
    barbershopId: appointment.barbershopId,
    barberId: appointment.barberId,
    clientId: appointment.clientId,
    serviceIds: [...appointment.serviceIds],
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    status: appointment.status,
    origin: appointment.origin,
    createdAt: appointment.createdAt,
  };
}

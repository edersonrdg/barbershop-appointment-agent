import type {
  AppointmentOrigin,
  AppointmentStatus,
} from '../../domain/entities/appointment';
import { UtcPeriod } from '../../domain/entities/barbershop';

export const SCHEDULE_QUERY = Symbol('ScheduleQuery');

export interface ScheduleEntry {
  id: string;
  barber: { id: string; name: string };
  client: { id: string; name: string; phone: string } | null;
  services: { id: string; name: string }[];
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
}

export interface ScheduleQuery {
  /**
   * The appointments of the barbershop that start in `[range.start,
   * range.end)`, only of `barberId` when it is not null, ordered by start,
   * case-insensitive barber name and id. Services keep the booked order.
   */
  listStartingIn(
    barbershopId: string,
    range: UtcPeriod,
    barberId: string | null,
  ): Promise<ScheduleEntry[]>;

  /**
   * The confirmed appointments of `barberId` in the barbershop whose
   * `[start, end)` overlaps `range`, ordered by start; touching ones are left
   * out. Same entry format as `listStartingIn`.
   */
  listOverlapping(
    barbershopId: string,
    barberId: string,
    range: UtcPeriod,
  ): Promise<ScheduleEntry[]>;

  /**
   * The appointment of the barbershop with `appointmentId`, in the same entry
   * format as `listStartingIn`; null when it does not exist there.
   */
  findById(
    barbershopId: string,
    appointmentId: string,
  ): Promise<ScheduleEntry | null>;

  /**
   * The appointments of `clientId` in the barbershop, only of `barberId` when
   * it is not null, ordered by start and id, in the same entry format as
   * `listStartingIn`.
   */
  listForClient(
    barbershopId: string,
    clientId: string,
    barberId: string | null,
  ): Promise<ScheduleEntry[]>;
}

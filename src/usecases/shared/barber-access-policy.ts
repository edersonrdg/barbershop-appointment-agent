import { Barber } from '../../domain/entities/barber';
import { UserRole } from '../../domain/entities/user';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { BarberRepository } from '../ports/barber.repository.port';

export interface BarberAccessRequest {
  barbershopId: string;
  userId: string;
  role: UserRole;
}

// PRD section 5: the owner reaches every barber of the barbershop; a barber
// reaches only the barber linked to their user (CA-05.2, CA-08.2).
export class BarberAccessPolicy {
  constructor(private readonly barbers: BarberRepository) {}

  /**
   * The barber a read is limited to: `null` for every barber (owner without a
   * filter), an id for one barber, or `undefined` for a barber user without a
   * barber record, who has nothing of their own to read.
   */
  async readScope(
    request: BarberAccessRequest & { barberId?: string },
  ): Promise<string | null | undefined> {
    if (request.role === 'barber') {
      const own = await this.ownBarber(request);
      if (request.barberId !== undefined && request.barberId !== own?.id) {
        throw new ScheduleAccessDeniedError();
      }
      return own?.id;
    }
    if (request.barberId === undefined) return null;
    const barber = await this.barberOfBarbershop(request, request.barberId);
    return barber.id;
  }

  /** The barber a write targets, active or not. */
  async targetBarber(
    request: BarberAccessRequest & { barberId: string },
  ): Promise<Barber> {
    if (request.role !== 'barber') {
      return this.barberOfBarbershop(request, request.barberId);
    }
    const own = await this.ownBarber(request);
    if (!own || own.id !== request.barberId) {
      throw new ScheduleAccessDeniedError();
    }
    return own;
  }

  /** Whether the user may change a record that belongs to `barberId`. */
  async assertCanManage(
    request: BarberAccessRequest & { barberId: string },
  ): Promise<void> {
    if (request.role !== 'barber') return;
    const own = await this.ownBarber(request);
    if (own?.id !== request.barberId) {
      throw new ScheduleAccessDeniedError();
    }
  }

  private ownBarber(request: BarberAccessRequest): Promise<Barber | null> {
    return this.barbers.findByUserId(request.barbershopId, request.userId);
  }

  private async barberOfBarbershop(
    request: BarberAccessRequest,
    barberId: string,
  ): Promise<Barber> {
    const barber = await this.barbers.findById(request.barbershopId, barberId);
    if (!barber) {
      throw new BarberNotFoundError();
    }
    return barber;
  }
}

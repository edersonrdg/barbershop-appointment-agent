import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { ListAvailableSlotsUseCase } from '../list-available-slots/list-available-slots.use-case';
import { BarberRepository } from '../ports/barber.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import {
  BarberAccessPolicy,
  BarberAccessRequest,
} from '../shared/barber-access-policy';

export type ListPanelSlotsInput = BarberAccessRequest & {
  /** Local date of the barbershop, `YYYY-MM-DD`. */
  date: string;
  serviceIds: readonly string[];
  barberId?: string;
};

export interface PanelSlot {
  barber: { id: string; name: string };
  startsAt: Date;
  endsAt: Date;
}

export interface PanelSlots {
  date: string;
  timezone: string;
  slots: PanelSlot[];
}

export class ListPanelSlotsUseCase {
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly access: BarberAccessPolicy,
    private readonly listSlots: ListAvailableSlotsUseCase,
    private readonly barbers: BarberRepository,
  ) {}

  async execute(input: ListPanelSlotsInput): Promise<PanelSlots> {
    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new InvalidCredentialsError();
    }
    const timezone = BarbershopTimezone.create(barbershop.timezone);
    const barberId = await this.access.readScope(input);
    // CA-10.5: a barber user without a barber record has no schedule to book.
    if (barberId === undefined) {
      throw new ScheduleAccessDeniedError();
    }
    // CA-10.3: the panel books as `manual`, so no minimum advance applies.
    const slots = await this.listSlots.execute({
      barbershopId: input.barbershopId,
      barberId,
      serviceIds: input.serviceIds,
      date: input.date,
      origin: 'manual',
    });
    const barbers = await this.barbers.listByBarbershop(input.barbershopId);
    const nameOf = new Map(barbers.map((barber) => [barber.id, barber.name]));
    return {
      date: input.date,
      timezone: timezone.value,
      slots: slots.map((slot) => ({
        barber: { id: slot.barberId, name: nameOf.get(slot.barberId) ?? '' },
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      })),
    };
  }
}

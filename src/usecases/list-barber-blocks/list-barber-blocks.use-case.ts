import { UserRole } from '../../domain/entities/user';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import {
  SchedulePeriod,
  ScheduleView,
} from '../../domain/value-objects/schedule-period';
import {
  BarberBlockRepository,
  BarberBlockView,
} from '../ports/barber-block.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { BarberAccessPolicy } from '../shared/barber-access-policy';

export interface ListBarberBlocksInput {
  barbershopId: string;
  userId: string;
  role: UserRole;
  view: ScheduleView;
  date: string;
  barberId?: string;
}

export interface BarberBlockList {
  period: SchedulePeriod;
  timezone: string;
  blocks: BarberBlockView[];
}

export class ListBarberBlocksUseCase {
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly access: BarberAccessPolicy,
    private readonly blocks: BarberBlockRepository,
  ) {}

  async execute(input: ListBarberBlocksInput): Promise<BarberBlockList> {
    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new InvalidCredentialsError();
    }
    const timezone = BarbershopTimezone.create(barbershop.timezone);
    const period = SchedulePeriod.create({
      view: input.view,
      localDate: input.date,
      timezone,
    });
    const barberId = await this.access.readScope(input);
    const blocks =
      barberId === undefined
        ? []
        : await this.blocks.listStartingIn(
            input.barbershopId,
            period.utc,
            barberId,
          );
    return { period, timezone: timezone.value, blocks };
  }
}

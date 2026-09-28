import { BarberBlock } from '../../domain/entities/barber-block';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import {
  BlockPeriod,
  BlockPeriodInput,
} from '../../domain/value-objects/block-period';
import {
  BarberBlockRepository,
  BarberBlockView,
} from '../ports/barber-block.repository.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { IdGenerator } from '../ports/id-generator.port';
import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';
import {
  BarberAccessPolicy,
  BarberAccessRequest,
} from '../shared/barber-access-policy';
import { BarberBlockConflictError } from './barber-block-conflict.error';

export type CreateBarberBlockInput = BarberAccessRequest & {
  barberId: string;
  date: string;
  reason?: string | null;
  confirmConflicts?: boolean;
} & ({ kind: 'day_off' } | { kind: 'block'; start: string; end: string });

export interface CreatedBarberBlock {
  block: BarberBlockView;
  affectedAppointments: ScheduleEntry[];
}

export class CreateBarberBlockUseCase {
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly access: BarberAccessPolicy,
    private readonly schedule: ScheduleQuery,
    private readonly blocks: BarberBlockRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateBarberBlockInput): Promise<CreatedBarberBlock> {
    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new InvalidCredentialsError();
    }
    const barber = await this.access.targetBarber(input);
    const period = BlockPeriod.resolve(
      periodInput(input),
      BarbershopTimezone.create(barbershop.timezone),
    );
    const block = BarberBlock.create({
      id: this.ids.next(),
      barbershopId: input.barbershopId,
      barberId: barber.id,
      kind: input.kind,
      period,
      reason: input.reason,
      now: this.clock.now(),
    });
    const affectedAppointments = await this.schedule.listOverlapping(
      input.barbershopId,
      barber.id,
      period,
    );
    // CA-09.3: appointments reached by the block are never cancelled; the
    // block is saved only once the user confirms after seeing them.
    if (affectedAppointments.length > 0 && input.confirmConflicts !== true) {
      throw new BarberBlockConflictError(affectedAppointments);
    }
    await this.blocks.create(block);
    return {
      block: {
        id: block.id,
        barber: { id: barber.id, name: barber.name },
        kind: block.kind,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        reason: block.reason,
      },
      affectedAppointments,
    };
  }
}

function periodInput(input: CreateBarberBlockInput): BlockPeriodInput {
  if (input.kind === 'day_off') {
    return { kind: 'day_off', localDate: input.date };
  }
  return {
    kind: 'block',
    localDate: input.date,
    start: input.start,
    end: input.end,
  };
}

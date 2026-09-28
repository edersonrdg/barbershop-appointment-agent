import { InvalidValueError } from '../errors/invalid-value.error';
import { BLOCK_END_BEFORE_START_MESSAGE } from '../value-objects/block-period';
import { UtcPeriod } from './barbershop';

export const BLOCK_REASON_MAX_LENGTH = 120;
export const BLOCK_REASON_TOO_LONG_MESSAGE =
  'Informe um motivo de até 120 caracteres.';

export type BarberBlockKind = 'block' | 'day_off';

export interface BarberBlockProps {
  id: string;
  barbershopId: string;
  barberId: string;
  kind: BarberBlockKind;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  createdAt: Date;
}

export class BarberBlock {
  private constructor(private readonly props: BarberBlockProps) {}

  static create({
    id,
    barbershopId,
    barberId,
    kind,
    period,
    reason,
    now,
  }: {
    id: string;
    barbershopId: string;
    barberId: string;
    kind: BarberBlockKind;
    period: UtcPeriod;
    reason?: string | null;
    now: Date;
  }): BarberBlock {
    if (period.end.getTime() <= period.start.getTime()) {
      throw new InvalidValueError(BLOCK_END_BEFORE_START_MESSAGE);
    }
    return new BarberBlock({
      id,
      barbershopId,
      barberId,
      kind,
      startsAt: period.start,
      endsAt: period.end,
      reason: normalizeReason(reason),
      createdAt: now,
    });
  }

  static restore(props: BarberBlockProps): BarberBlock {
    return new BarberBlock({ ...props });
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

  get kind(): BarberBlockKind {
    return this.props.kind;
  }

  get startsAt(): Date {
    return this.props.startsAt;
  }

  get endsAt(): Date {
    return this.props.endsAt;
  }

  get reason(): string | null {
    return this.props.reason;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}

function normalizeReason(raw: string | null | undefined): string | null {
  const reason = raw?.trim() ?? '';
  if (reason.length === 0) return null;
  if (reason.length > BLOCK_REASON_MAX_LENGTH) {
    throw new InvalidValueError(BLOCK_REASON_TOO_LONG_MESSAGE);
  }
  return reason;
}

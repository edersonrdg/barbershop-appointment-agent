import { UtcPeriod } from '../entities/barbershop';

const MS_PER_MINUTE = 60 * 1000;
const SLOT_STEP_MINUTES = 30;

export interface AvailableSlot {
  barberId: string;
  startsAt: Date;
  endsAt: Date;
}

export type ScheduleViolation =
  'outside-opening-hours' | 'outside-working-hours' | 'blocked' | 'overlap';

export interface BarberDayScheduleProps {
  barberId: string;
  openPeriods: readonly UtcPeriod[];
  workPeriods: readonly UtcPeriod[];
  blocks: readonly UtcPeriod[];
  appointments: readonly UtcPeriod[];
}

// Every period is half-open, [start, end): an appointment that ends when
// another starts does not overlap it (CA-07.1).
export class BarberDaySchedule {
  private constructor(private readonly props: BarberDayScheduleProps) {}

  static create(props: BarberDayScheduleProps): BarberDaySchedule {
    return new BarberDaySchedule({
      barberId: props.barberId,
      openPeriods: [...props.openPeriods],
      workPeriods: [...props.workPeriods],
      blocks: [...props.blocks],
      appointments: [...props.appointments],
    });
  }

  // CA-07.1: the 30-minute grid restarts at the beginning of each free period,
  // so a start right after an appointment ending at 14:45 is 14:45.
  offer(durationMinutes: number, earliest: Date): AvailableSlot[] {
    const duration = durationMinutes * MS_PER_MINUTE;
    const step = SLOT_STEP_MINUTES * MS_PER_MINUTE;
    const slots: AvailableSlot[] = [];
    for (const free of this.freePeriods()) {
      for (
        let start = free.start.getTime();
        start + duration <= free.end.getTime();
        start += step
      ) {
        if (start < earliest.getTime()) continue;
        slots.push({
          barberId: this.props.barberId,
          startsAt: new Date(start),
          endsAt: new Date(start + duration),
        });
      }
    }
    return slots;
  }

  // CA-07.5: the order of the checks decides which rule is reported when
  // several are broken (AVL-25).
  violationOf(period: UtcPeriod): ScheduleViolation | null {
    const { openPeriods, workPeriods, blocks, appointments } = this.props;
    if (!openPeriods.some((open) => contains(open, period))) {
      return 'outside-opening-hours';
    }
    if (!workPeriods.some((work) => contains(work, period))) {
      return 'outside-working-hours';
    }
    if (blocks.some((block) => overlaps(block, period))) return 'blocked';
    if (appointments.some((busy) => overlaps(busy, period))) return 'overlap';
    return null;
  }

  private freePeriods(): UtcPeriod[] {
    const { openPeriods, workPeriods, blocks, appointments } = this.props;
    const available = openPeriods.flatMap((open) =>
      workPeriods.flatMap((work) => intersection(open, work)),
    );
    const free = [...blocks, ...appointments].reduce(
      (periods, busy) => periods.flatMap((period) => subtract(period, busy)),
      available,
    );
    return free.sort((a, b) => a.start.getTime() - b.start.getTime());
  }
}

function contains(outer: UtcPeriod, inner: UtcPeriod): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

function overlaps(a: UtcPeriod, b: UtcPeriod): boolean {
  return a.start < b.end && b.start < a.end;
}

function intersection(a: UtcPeriod, b: UtcPeriod): UtcPeriod[] {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  return start < end ? [{ start, end }] : [];
}

function subtract(period: UtcPeriod, busy: UtcPeriod): UtcPeriod[] {
  if (!overlaps(period, busy)) return [period];
  const rest: UtcPeriod[] = [];
  if (period.start < busy.start) {
    rest.push({ start: period.start, end: busy.start });
  }
  if (busy.end < period.end) {
    rest.push({ start: busy.end, end: period.end });
  }
  return rest;
}

import { Clock } from '../ports/clock.port';

export class FixedClock implements Clock {
  constructor(private readonly current: Date) {}

  now(): Date {
    return this.current;
  }
}

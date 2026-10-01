import { Clock } from '../ports/clock.port';

export class SettableClock implements Clock {
  constructor(public current: Date) {}

  now(): Date {
    return this.current;
  }
}

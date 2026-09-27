import { Clock } from '../../usecases/ports/clock.port';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

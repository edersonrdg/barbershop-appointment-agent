import { InvalidValueError } from '../errors/invalid-value.error';

export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 480;
export const DURATION_STEP_MINUTES = 5;

export class ServiceDuration {
  private constructor(private readonly value: number) {}

  static create(minutes: number): ServiceDuration {
    if (!ServiceDuration.isValid(minutes)) {
      throw new InvalidValueError('Duração inválida.');
    }
    return new ServiceDuration(minutes);
  }

  static isValid(minutes: number): boolean {
    return (
      Number.isInteger(minutes) &&
      minutes >= MIN_DURATION_MINUTES &&
      minutes <= MAX_DURATION_MINUTES &&
      minutes % DURATION_STEP_MINUTES === 0
    );
  }

  get minutes(): number {
    return this.value;
  }
}

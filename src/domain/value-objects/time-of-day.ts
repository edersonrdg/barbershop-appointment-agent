import { InvalidValueError } from '../errors/invalid-value.error';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class TimeOfDay {
  private constructor(private readonly value: string) {}

  static create(raw: string): TimeOfDay {
    if (!TimeOfDay.isValid(raw)) {
      throw new InvalidValueError('Horário inválido.');
    }
    return new TimeOfDay(raw);
  }

  static isValid(raw: string): boolean {
    return TIME_PATTERN.test(raw);
  }

  get minutes(): number {
    const [hours, minutes] = this.value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  toString(): string {
    return this.value;
  }
}

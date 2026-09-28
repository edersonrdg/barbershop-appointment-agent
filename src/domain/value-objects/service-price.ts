import { InvalidValueError } from '../errors/invalid-value.error';

export const MIN_PRICE_CENTS = 0;
export const MAX_PRICE_CENTS = 1_000_000;

export class ServicePrice {
  private constructor(private readonly value: number) {}

  static create(cents: number): ServicePrice {
    if (!ServicePrice.isValid(cents)) {
      throw new InvalidValueError('Preço inválido.');
    }
    return new ServicePrice(cents);
  }

  static isValid(cents: number): boolean {
    return (
      Number.isInteger(cents) &&
      cents >= MIN_PRICE_CENTS &&
      cents <= MAX_PRICE_CENTS
    );
  }

  get cents(): number {
    return this.value;
  }
}

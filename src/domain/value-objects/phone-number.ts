import { InvalidValueError } from '../errors/invalid-value.error';

const ALLOWED_CHARS_PATTERN = /^[+\d\s().-]+$/;
const COUNTRY_CODE = '55';

export class PhoneNumber {
  private constructor(private readonly e164: string) {}

  static create(raw: string): PhoneNumber {
    const national = toNationalDigits(raw);
    if (!national) {
      throw new InvalidValueError('Telefone inválido.');
    }
    return new PhoneNumber(`+${COUNTRY_CODE}${national}`);
  }

  static isValid(raw: string): boolean {
    return toNationalDigits(raw) !== null;
  }

  get value(): string {
    return this.e164;
  }
}

function toNationalDigits(raw: string): string | null {
  if (!ALLOWED_CHARS_PATTERN.test(raw)) {
    return null;
  }

  const digits = raw.replace(/\D/g, '');
  const national = stripCountryCode(digits);
  if (national.length !== 10 && national.length !== 11) {
    return null;
  }

  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) {
    return null;
  }

  const subscriber = national.slice(2);
  if (subscriber.length === 9 && subscriber[0] !== '9') {
    return null;
  }

  return national;
}

function stripCountryCode(digits: string): string {
  const hasCountryCode =
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith(COUNTRY_CODE);
  return hasCountryCode ? digits.slice(COUNTRY_CODE.length) : digits;
}

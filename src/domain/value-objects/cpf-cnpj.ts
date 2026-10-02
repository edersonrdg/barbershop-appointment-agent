import { InvalidValueError } from '../errors/invalid-value.error';

export const CPF_CNPJ_MESSAGE = 'Informe um CPF ou CNPJ válido.';

const ALLOWED_CHARS_PATTERN = /^[\d./-]+$/;
const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;
const CPF_WEIGHTS = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

// US-20: the payer document the gateway requires for a Pix subscription. Only
// the digits are kept; it is sent to the gateway and never stored (LGPD).
export class CpfCnpj {
  private constructor(private readonly digits: string) {}

  static create(raw: string): CpfCnpj {
    const digits = toDigits(raw);
    if (!digits) {
      throw new InvalidValueError(CPF_CNPJ_MESSAGE);
    }
    return new CpfCnpj(digits);
  }

  static isValid(raw: string): boolean {
    return toDigits(raw) !== null;
  }

  get value(): string {
    return this.digits;
  }
}

function toDigits(raw: string): string | null {
  if (!ALLOWED_CHARS_PATTERN.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== CPF_LENGTH && digits.length !== CNPJ_LENGTH) {
    return null;
  }
  // A document made of one repeated digit passes the check digits and is not
  // issued by the Receita Federal.
  if (/^(\d)\1+$/.test(digits)) return null;
  const weights = digits.length === CPF_LENGTH ? CPF_WEIGHTS : CNPJ_WEIGHTS;
  return hasValidCheckDigits(digits, weights) ? digits : null;
}

// The second check digit uses the first one, with one more leading weight.
function hasValidCheckDigits(digits: string, weights: number[]): boolean {
  const base = digits.length - 2;
  const first = checkDigit(digits.slice(0, base), weights);
  const second = checkDigit(digits.slice(0, base + 1), [
    weights[0] + 1,
    ...weights,
  ]);
  return digits.endsWith(`${first}${second}`);
}

function checkDigit(digits: string, weights: number[]): number {
  const sum = [...digits].reduce(
    (total, digit, index) => total + Number(digit) * weights[index],
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

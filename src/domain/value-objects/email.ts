import { InvalidValueError } from '../errors/invalid-value.error';

const MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(private readonly normalized: string) {}

  static create(raw: string): Email {
    const normalized = normalize(raw);
    if (!matches(normalized)) {
      throw new InvalidValueError('E-mail inválido.');
    }
    return new Email(normalized);
  }

  static isValid(raw: string): boolean {
    return matches(normalize(raw));
  }

  get value(): string {
    return this.normalized;
  }
}

function normalize(raw: string): string {
  return raw.trim().toLowerCase();
}

function matches(normalized: string): boolean {
  return (
    normalized.length > 0 &&
    normalized.length <= MAX_LENGTH &&
    EMAIL_PATTERN.test(normalized)
  );
}

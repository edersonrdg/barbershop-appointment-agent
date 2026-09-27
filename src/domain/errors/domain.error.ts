export abstract class DomainError extends Error {
  abstract readonly code: string;
  readonly rule?: string;

  constructor(message: string, rule?: string) {
    super(message);
    this.name = this.constructor.name;
    this.rule = rule;
  }
}

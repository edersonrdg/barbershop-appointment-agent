import { DomainError } from './domain.error';

export class InvalidValueError extends DomainError {
  readonly code = 'INVALID_VALUE';
}

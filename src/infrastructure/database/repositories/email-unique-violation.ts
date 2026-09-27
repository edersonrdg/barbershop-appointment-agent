import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';
const USERS_EMAIL_UNIQUE = 'users_email_unique';

export function isEmailUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError: unknown = error.driverError;
  if (typeof driverError !== 'object' || driverError === null) return false;
  return (
    'code' in driverError &&
    driverError.code === UNIQUE_VIOLATION &&
    'constraint' in driverError &&
    driverError.constraint === USERS_EMAIL_UNIQUE
  );
}

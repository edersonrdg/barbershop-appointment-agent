export const ACCOUNT_METRICS = Symbol('AccountMetrics');

export interface AccountMetrics {
  signupCompleted(): void;
}

import { AccountMetrics } from '../ports/account-metrics.port';

export class CountingAccountMetrics implements AccountMetrics {
  signups = 0;

  signupCompleted(): void {
    this.signups += 1;
  }
}

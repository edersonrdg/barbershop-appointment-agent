import {
  GeneratedResetToken,
  ResetTokenGenerator,
} from '../ports/reset-token-generator.port';

export class FakeResetTokenGenerator implements ResetTokenGenerator {
  private counter = 0;

  generate(): GeneratedResetToken {
    this.counter += 1;
    const token = `reset-token-${this.counter}`;
    return { token, tokenHash: this.hashOf(token) };
  }

  hashOf(token: string): string {
    return `sha256(${token})`;
  }
}

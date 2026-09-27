import { createHash, randomBytes } from 'node:crypto';
import {
  GeneratedResetToken,
  ResetTokenGenerator,
} from '../../usecases/ports/reset-token-generator.port';

const TOKEN_LENGTH_BYTES = 32;

export class CryptoResetTokenGenerator implements ResetTokenGenerator {
  generate(): GeneratedResetToken {
    const token = randomBytes(TOKEN_LENGTH_BYTES).toString('base64url');
    return { token, tokenHash: this.hashOf(token) };
  }

  hashOf(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

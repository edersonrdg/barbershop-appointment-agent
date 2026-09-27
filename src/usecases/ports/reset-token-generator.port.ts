export const RESET_TOKEN_GENERATOR = Symbol('ResetTokenGenerator');

export interface GeneratedResetToken {
  token: string;
  tokenHash: string;
}

export interface ResetTokenGenerator {
  generate(): GeneratedResetToken;
  hashOf(token: string): string;
}

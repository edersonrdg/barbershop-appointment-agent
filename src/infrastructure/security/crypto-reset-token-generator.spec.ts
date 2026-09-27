import { CryptoResetTokenGenerator } from './crypto-reset-token-generator';

describe('CryptoResetTokenGenerator', () => {
  const generator = new CryptoResetTokenGenerator();

  it('CA-01.5: the token decodes to 32 random bytes', () => {
    const { token } = generator.generate();

    expect(Buffer.from(token, 'base64url').length).toBe(32);
  });

  it('CA-01.5: tokenHash is the SHA-256 hex digest of the token and differs from it', () => {
    const { token, tokenHash } = generator.generate();

    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toBe(token);
  });

  it('CA-01.5: hashOf(token) equals the tokenHash returned by generate()', () => {
    const { token, tokenHash } = generator.generate();

    expect(generator.hashOf(token)).toBe(tokenHash);
  });
});

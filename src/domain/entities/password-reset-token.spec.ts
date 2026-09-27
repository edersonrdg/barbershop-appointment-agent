import { PasswordResetToken } from './password-reset-token';

describe('PasswordResetToken', () => {
  const now = new Date('2026-09-27T12:00:00.000Z');

  function issueToken(): PasswordResetToken {
    return PasswordResetToken.issue({
      id: 'token-1',
      userId: 'user-1',
      barbershopId: 'barbershop-1',
      tokenHash: 'hash',
      now,
    });
  }

  describe('CA-01.5: 1-hour validity window', () => {
    it('is redeemable at now + 59min59s', () => {
      const token = issueToken();
      const almostOneHourLater = new Date(
        now.getTime() + 59 * 60 * 1000 + 59 * 1000,
      );

      expect(token.isRedeemable(almostOneHourLater)).toBe(true);
    });

    it('is not redeemable at exactly now + 1h', () => {
      const token = issueToken();
      const exactlyOneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      expect(token.isRedeemable(exactlyOneHourLater)).toBe(false);
    });

    it('is not redeemable after now + 1h', () => {
      const token = issueToken();
      const afterOneHour = new Date(now.getTime() + 60 * 60 * 1000 + 1000);

      expect(token.isRedeemable(afterOneHour)).toBe(false);
    });

    it('is not redeemable when usedAt is filled', () => {
      const usedToken = PasswordResetToken.restore({
        id: 'token-1',
        userId: 'user-1',
        barbershopId: 'barbershop-1',
        tokenHash: 'hash',
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        usedAt: now,
        createdAt: now,
      });

      expect(usedToken.isRedeemable(now)).toBe(false);
    });
  });
});

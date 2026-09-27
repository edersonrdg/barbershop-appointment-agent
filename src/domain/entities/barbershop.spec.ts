import { Barbershop } from './barbershop';

describe('Barbershop', () => {
  describe('CA-01.2: 14-day free trial', () => {
    it('ends the trial exactly 14 days (14 x 86 400 000 ms) after signup, with status trialing', () => {
      const now = new Date('2026-09-27T12:00:00.000Z');

      const barbershop = Barbershop.startTrial({
        id: 'barbershop-1',
        name: 'Barbearia do Zé',
        now,
      });

      expect(barbershop.subscriptionStatus).toBe('trialing');
      expect(barbershop.trialEndsAt.getTime() - now.getTime()).toBe(
        14 * 24 * 60 * 60 * 1000,
      );
    });

    it('defaults the timezone to America/Sao_Paulo (RNF-04)', () => {
      const barbershop = Barbershop.startTrial({
        id: 'barbershop-1',
        name: 'Barbearia do Zé',
        now: new Date('2026-09-27T12:00:00.000Z'),
      });

      expect(barbershop.timezone).toBe('America/Sao_Paulo');
    });
  });
});

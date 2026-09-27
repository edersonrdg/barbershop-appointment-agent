import { User } from './user';

describe('User', () => {
  describe('CA-01.1: owner creation', () => {
    it('creates a user with role owner linked to the given barbershop', () => {
      const now = new Date('2026-09-27T12:00:00.000Z');

      const owner = User.createOwner({
        id: 'user-1',
        barbershopId: 'barbershop-1',
        name: 'Zé',
        email: 'dono@barbearia.com',
        phone: '+5511912345678',
        passwordHash: 'scrypt$hash',
        now,
      });

      expect(owner.role).toBe('owner');
      expect(owner.barbershopId).toBe('barbershop-1');
    });
  });
});

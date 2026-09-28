import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { seedBarber } from '../testing/barber-fixtures';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { BarberAccessPolicy } from './barber-access-policy';

async function setup() {
  const barbers = new InMemoryBarberRepository();
  await seedBarber(barbers, {
    id: 'barber-ana',
    name: 'Ana',
    userId: 'user-ana',
  });
  await seedBarber(barbers, {
    id: 'barber-bruno',
    name: 'Bruno',
    userId: 'user-bruno',
  });
  await seedBarber(barbers, { id: 'barber-caio', name: 'Caio', active: false });
  await seedBarber(barbers, {
    id: 'barber-foreign',
    name: 'Davi',
    barbershopId: 'barbershop-b',
  });
  return new BarberAccessPolicy(barbers);
}

const owner = {
  barbershopId: 'barbershop-a',
  userId: 'owner',
  role: 'owner',
} as const;
const bruno = {
  barbershopId: 'barbershop-a',
  userId: 'user-bruno',
  role: 'barber',
} as const;
const withoutBarber = {
  barbershopId: 'barbershop-a',
  userId: 'user-without-barber',
  role: 'barber',
} as const;

describe('BarberAccessPolicy', () => {
  describe('readScope', () => {
    it('section 5: the owner without a filter reads every barber', async () => {
      const policy = await setup();

      await expect(policy.readScope(owner)).resolves.toBeNull();
    });

    it('section 5: the owner with a barber of the barbershop reads that barber', async () => {
      const policy = await setup();

      await expect(
        policy.readScope({ ...owner, barberId: 'barber-caio' }),
      ).resolves.toBe('barber-caio');
    });

    it('RN-26: the owner with an unknown or foreign barber gets BarberNotFoundError', async () => {
      const policy = await setup();

      await expect(
        policy.readScope({ ...owner, barberId: 'barber-foreign' }),
      ).rejects.toThrow(new BarberNotFoundError());
      await expect(
        policy.readScope({ ...owner, barberId: 'barber-unknown' }),
      ).rejects.toThrow(new BarberNotFoundError());
    });

    it('section 5: a barber reads their own barber, with or without the filter', async () => {
      const policy = await setup();

      await expect(policy.readScope(bruno)).resolves.toBe('barber-bruno');
      await expect(
        policy.readScope({ ...bruno, barberId: 'barber-bruno' }),
      ).resolves.toBe('barber-bruno');
    });

    it('section 5: a barber asking for another barber gets "Acesso negado."', async () => {
      const policy = await setup();

      await expect(
        policy.readScope({ ...bruno, barberId: 'barber-ana' }),
      ).rejects.toThrow(new ScheduleAccessDeniedError());
    });

    it('section 5: a barber user without a barber record reads nothing', async () => {
      const policy = await setup();

      await expect(policy.readScope(withoutBarber)).resolves.toBeUndefined();
    });
  });

  describe('targetBarber', () => {
    it('section 5: the owner targets any barber of the barbershop, inactive included', async () => {
      const policy = await setup();

      const barber = await policy.targetBarber({
        ...owner,
        barberId: 'barber-caio',
      });

      expect(barber.id).toBe('barber-caio');
      expect(barber.name).toBe('Caio');
    });

    it('RN-26: the owner targeting an unknown or foreign barber gets BarberNotFoundError', async () => {
      const policy = await setup();

      await expect(
        policy.targetBarber({ ...owner, barberId: 'barber-foreign' }),
      ).rejects.toThrow(new BarberNotFoundError());
      await expect(
        policy.targetBarber({ ...owner, barberId: 'barber-unknown' }),
      ).rejects.toThrow(new BarberNotFoundError());
    });

    it('section 5: a barber targets only their own barber', async () => {
      const policy = await setup();

      const barber = await policy.targetBarber({
        ...bruno,
        barberId: 'barber-bruno',
      });

      expect(barber.id).toBe('barber-bruno');
      expect(barber.name).toBe('Bruno');
    });

    it('section 5: a barber targeting another barber gets "Acesso negado."', async () => {
      const policy = await setup();

      await expect(
        policy.targetBarber({ ...bruno, barberId: 'barber-ana' }),
      ).rejects.toThrow(new ScheduleAccessDeniedError());
    });

    it('section 5: a barber user without a barber record gets "Acesso negado."', async () => {
      const policy = await setup();

      await expect(
        policy.targetBarber({ ...withoutBarber, barberId: 'barber-ana' }),
      ).rejects.toThrow(new ScheduleAccessDeniedError());
    });
  });

  describe('assertCanManage', () => {
    it('section 5: the owner manages records of any barber', async () => {
      const policy = await setup();

      await expect(
        policy.assertCanManage({ ...owner, barberId: 'barber-ana' }),
      ).resolves.toBeUndefined();
    });

    it('section 5: a barber manages the records of their own barber', async () => {
      const policy = await setup();

      await expect(
        policy.assertCanManage({ ...bruno, barberId: 'barber-bruno' }),
      ).resolves.toBeUndefined();
    });

    it('section 5: a barber managing a record of another barber gets "Acesso negado."', async () => {
      const policy = await setup();

      await expect(
        policy.assertCanManage({ ...bruno, barberId: 'barber-ana' }),
      ).rejects.toThrow(new ScheduleAccessDeniedError());
    });

    it('section 5: a barber user without a barber record gets "Acesso negado."', async () => {
      const policy = await setup();

      await expect(
        policy.assertCanManage({ ...withoutBarber, barberId: 'barber-ana' }),
      ).rejects.toThrow(new ScheduleAccessDeniedError());
    });
  });
});

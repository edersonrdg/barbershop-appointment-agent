import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import {
  BarberState,
  day,
  describeBarber,
  seedBarber,
  workingHoursInput,
} from '../testing/barber-fixtures';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { SetBarberActiveUseCase } from './set-barber-active.use-case';

async function setup() {
  const barbers = new InMemoryBarberRepository();
  await seedBarber(barbers, {
    id: 'joao',
    name: 'João',
    userId: 'barber-a',
    serviceIds: ['haircut', 'beard'],
    workingHours: workingHoursInput({
      monday: day('09:00', '18:00', ['12:00', '13:00']),
    }),
  });
  await seedBarber(barbers, {
    id: 'foreign',
    name: 'Bruno',
    barbershopId: 'barbershop-b',
  });
  return { barbers, useCase: new SetBarberActiveUseCase(barbers) };
}

async function stored(
  barbers: InMemoryBarberRepository,
  barberId = 'joao',
): Promise<BarberState> {
  return describeBarber((await barbers.findById('barbershop-a', barberId))!);
}

describe('SetBarberActiveUseCase', () => {
  it('deactivates the barber, returns it with active false and changes nothing else', async () => {
    const { barbers, useCase } = await setup();
    const before = await stored(barbers);

    const barber = await useCase.execute({
      barbershopId: 'barbershop-a',
      barberId: 'joao',
      active: false,
    });

    expect(describeBarber(barber)).toEqual({ ...before, active: false });
    expect(await stored(barbers)).toEqual({ ...before, active: false });
  });

  it('activates an inactive barber and changes nothing else', async () => {
    const { barbers, useCase } = await setup();
    await useCase.execute({
      barbershopId: 'barbershop-a',
      barberId: 'joao',
      active: false,
    });
    const before = await stored(barbers);

    const barber = await useCase.execute({
      barbershopId: 'barbershop-a',
      barberId: 'joao',
      active: true,
    });

    expect(barber.active).toBe(true);
    expect(await stored(barbers)).toEqual({ ...before, active: true });
  });

  it.each([true, false])(
    'setting active to %s twice ends in the same state',
    async (active) => {
      const { barbers, useCase } = await setup();
      const command = {
        barbershopId: 'barbershop-a',
        barberId: 'joao',
        active,
      };

      await useCase.execute(command);
      const once = await stored(barbers);
      const again = await useCase.execute(command);

      expect(again.active).toBe(active);
      expect(await stored(barbers)).toEqual(once);
    },
  );

  it.each([
    ['an unknown barber', 'missing'],
    ['a barber of another barbershop', 'foreign'],
  ])(
    '%s throws BarberNotFoundError and nothing changes',
    async (_case, barberId) => {
      const { barbers, useCase } = await setup();
      const before = await barbers.listByBarbershop('barbershop-b');

      await expect(
        useCase.execute({
          barbershopId: 'barbershop-a',
          barberId,
          active: false,
        }),
      ).rejects.toBeInstanceOf(BarberNotFoundError);

      expect(
        (await barbers.listByBarbershop('barbershop-b')).map(describeBarber),
      ).toEqual(before.map(describeBarber));
      expect((await stored(barbers)).active).toBe(true);
    },
  );
});

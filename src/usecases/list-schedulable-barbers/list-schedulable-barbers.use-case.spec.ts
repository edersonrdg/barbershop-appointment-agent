import {
  day,
  describeBarber,
  seedBarber,
  workingHoursInput,
} from '../testing/barber-fixtures';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { SetBarberActiveUseCase } from '../set-barber-active/set-barber-active.use-case';
import { ListSchedulableBarbersUseCase } from './list-schedulable-barbers.use-case';

const HOURS = workingHoursInput({
  monday: day('09:00', '18:00', ['12:00', '13:00']),
});

async function setup() {
  const barbers = new InMemoryBarberRepository();
  await seedBarber(barbers, {
    id: 'joao',
    name: 'João',
    serviceIds: ['haircut', 'beard'],
    workingHours: HOURS,
  });
  await seedBarber(barbers, { id: 'pedro', name: 'Pedro', active: false });
  await seedBarber(barbers, {
    id: 'bruno',
    name: 'Bruno',
    barbershopId: 'barbershop-b',
  });
  return {
    barbers,
    useCase: new ListSchedulableBarbersUseCase(barbers),
    setActive: new SetBarberActiveUseCase(barbers),
  };
}

async function schedulableIds(
  useCase: ListSchedulableBarbersUseCase,
): Promise<string[]> {
  const listed = await useCase.execute({ barbershopId: 'barbershop-a' });
  return listed.map((barber) => barber.id);
}

describe('ListSchedulableBarbersUseCase', () => {
  it('CA-05.1: returns only the active barbers of the barbershop with their services and working hours', async () => {
    const { useCase } = await setup();

    const listed = await useCase.execute({ barbershopId: 'barbershop-a' });

    expect(listed.map(describeBarber)).toEqual([
      expect.objectContaining({
        id: 'joao',
        serviceIds: ['haircut', 'beard'],
        workingHours: HOURS,
      }),
    ]);
  });

  it('a barber deactivated leaves the list and comes back when reactivated', async () => {
    const { useCase, setActive } = await setup();

    await setActive.execute({
      barbershopId: 'barbershop-a',
      barberId: 'joao',
      active: false,
    });
    expect(await schedulableIds(useCase)).toEqual([]);

    await setActive.execute({
      barbershopId: 'barbershop-a',
      barberId: 'joao',
      active: true,
    });
    expect(await schedulableIds(useCase)).toEqual(['joao']);
  });
});

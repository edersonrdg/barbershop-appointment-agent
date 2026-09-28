import { BarberBlock } from '../../domain/entities/barber-block';
import { BarberBlockNotFoundError } from '../../domain/errors/barber-block-not-found.error';
import { ScheduleAccessDeniedError } from '../../domain/errors/schedule-access-denied.error';
import { BarberAccessPolicy } from '../shared/barber-access-policy';
import { seedBarber } from '../testing/barber-fixtures';
import { InMemoryBarberBlockRepository } from '../testing/in-memory-barber-block.repository';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { at } from '../testing/scheduling-fixtures';
import { RemoveBarberBlockUseCase } from './remove-barber-block.use-case';

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
  await seedBarber(barbers, {
    id: 'barber-foreign',
    name: 'Davi',
    barbershopId: 'barbershop-b',
  });
  const blocks = new InMemoryBarberBlockRepository(barbers);
  const seed = (id: string, barberId: string, barbershopId = 'barbershop-a') =>
    blocks.create(
      BarberBlock.create({
        id,
        barbershopId,
        barberId,
        kind: 'block',
        period: { start: at('12:00'), end: at('13:00') },
        now: at('08:00'),
      }),
    );
  await seed('ana-lunch', 'barber-ana');
  await seed('bruno-lunch', 'barber-bruno');
  await seed('foreign-lunch', 'barber-foreign', 'barbershop-b');
  const useCase = new RemoveBarberBlockUseCase(
    new BarberAccessPolicy(barbers),
    blocks,
  );
  return { useCase, blocks };
}

const owner = {
  barbershopId: 'barbershop-a',
  userId: 'owner',
  role: 'owner',
} as const;
const brunoUser = {
  barbershopId: 'barbershop-a',
  userId: 'user-bruno',
  role: 'barber',
} as const;

describe('RemoveBarberBlockUseCase', () => {
  it('RF-26: the owner removes a block of any barber of the barbershop', async () => {
    const { useCase, blocks } = await setup();

    await useCase.execute({ ...owner, blockId: 'ana-lunch' });

    expect(await blocks.findById('barbershop-a', 'ana-lunch')).toBeNull();
    expect((await blocks.findById('barbershop-a', 'bruno-lunch'))?.id).toBe(
      'bruno-lunch',
    );
  });

  it('section 5: a barber removes their own block', async () => {
    const { useCase, blocks } = await setup();

    await useCase.execute({ ...brunoUser, blockId: 'bruno-lunch' });

    expect(await blocks.findById('barbershop-a', 'bruno-lunch')).toBeNull();
  });

  it('section 5: a barber removing a block of another barber gets "Acesso negado." and nothing is removed', async () => {
    const { useCase, blocks } = await setup();

    await expect(
      useCase.execute({ ...brunoUser, blockId: 'ana-lunch' }),
    ).rejects.toThrow(new ScheduleAccessDeniedError());
    expect((await blocks.findById('barbershop-a', 'ana-lunch'))?.id).toBe(
      'ana-lunch',
    );
  });

  it('section 5: a barber user without a barber record gets "Acesso negado." and nothing is removed', async () => {
    const { useCase, blocks } = await setup();

    await expect(
      useCase.execute({
        barbershopId: 'barbershop-a',
        userId: 'user-without-barber',
        role: 'barber',
        blockId: 'ana-lunch',
      }),
    ).rejects.toThrow(new ScheduleAccessDeniedError());
    expect((await blocks.findById('barbershop-a', 'ana-lunch'))?.id).toBe(
      'ana-lunch',
    );
  });

  it('RN-26: an unknown block gets "Bloqueio não encontrado."', async () => {
    const { useCase } = await setup();

    await expect(
      useCase.execute({ ...owner, blockId: 'unknown-block' }),
    ).rejects.toThrow(new BarberBlockNotFoundError());
    expect(new BarberBlockNotFoundError().message).toBe(
      'Bloqueio não encontrado.',
    );
  });

  it('RN-26: a block of another barbershop gets "Bloqueio não encontrado." and is not removed', async () => {
    const { useCase, blocks } = await setup();

    await expect(
      useCase.execute({ ...owner, blockId: 'foreign-lunch' }),
    ).rejects.toThrow(new BarberBlockNotFoundError());
    expect((await blocks.findById('barbershop-b', 'foreign-lunch'))?.id).toBe(
      'foreign-lunch',
    );
  });
});

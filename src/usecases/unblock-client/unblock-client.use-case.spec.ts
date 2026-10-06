import { Appointment } from '../../domain/entities/appointment';
import { Client } from '../../domain/entities/client';
import { ClientNotFoundError } from '../../domain/errors/client-not-found.error';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { InMemoryClientRepository } from '../testing/in-memory-client.repository';
import { InMemoryNoShowLedger } from '../testing/in-memory-no-show-ledger';
import { at, setupScheduling } from '../testing/scheduling-fixtures';
import { UnblockClientUseCase } from './unblock-client.use-case';

const NOW = at('10:00');
const SHOP = 'barbershop-a';

// Barbearia A com o limite de faltas padrão (2). João tem 2 faltas e está
// bloqueado; Pedro tem 1 falta e não está.
async function setup() {
  const env = await setupScheduling(NOW);
  const clients = new InMemoryClientRepository();
  for (const [id, phone] of [
    ['joao', '11987654321'],
    ['pedro', '11912345678'],
  ]) {
    clients.add(
      Client.create({
        id,
        barbershopId: SHOP,
        name: id,
        phone: PhoneNumber.create(phone),
        now: at('09:00', '2026-09-01'),
      }),
    );
  }
  let sequence = 0;
  const noShow = (clientId: string, day: string) =>
    env.appointments.create(
      Appointment.restore({
        id: `appointment-${++sequence}`,
        barbershopId: SHOP,
        barberId: `barber-${sequence}`,
        clientId,
        serviceIds: ['haircut'],
        startsAt: at('10:00', day),
        endsAt: at('10:30', day),
        status: 'no_show',
        origin: 'manual',
        createdAt: at('09:00', '2026-09-01'),
      }),
    );
  await noShow('joao', '2026-09-10');
  await noShow('joao', '2026-09-20');
  await noShow('pedro', '2026-09-10');
  const ledger = new InMemoryNoShowLedger(env.appointments);
  const useCase = new UnblockClientUseCase(
    clients,
    ledger,
    env.bookingRules,
    env.clock,
  );
  return { useCase, ledger };
}

describe('UnblockClientUseCase', () => {
  it('CA-22.1 (C1): resets a blocked client at the current instant', async () => {
    const { useCase, ledger } = await setup();

    await useCase.execute({ barbershopId: SHOP, clientId: 'joao' });

    expect(ledger.resetAtOf(SHOP, 'joao')).toEqual(NOW);
    expect(await ledger.countFor(SHOP, 'joao')).toBe(0);
  });

  it('AC 5 (C5): leaves a client below the no-show limit untouched', async () => {
    const { useCase, ledger } = await setup();

    await useCase.execute({ barbershopId: SHOP, clientId: 'pedro' });

    expect(ledger.resetAtOf(SHOP, 'pedro')).toBeNull();
    expect(await ledger.countFor(SHOP, 'pedro')).toBe(1);
  });

  it('AC 7 (C7): rejects a client that is not in the barbershop without resetting', async () => {
    const { useCase, ledger } = await setup();

    await expect(
      useCase.execute({ barbershopId: 'barbershop-b', clientId: 'joao' }),
    ).rejects.toThrow(ClientNotFoundError);
    expect(ledger.resetAtOf('barbershop-b', 'joao')).toBeNull();
    expect(ledger.resetAtOf(SHOP, 'joao')).toBeNull();
  });
});

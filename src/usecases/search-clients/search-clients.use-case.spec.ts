import { Client } from '../../domain/entities/client';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { seedBarber } from '../testing/barber-fixtures';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { InMemoryClientRepository } from '../testing/in-memory-client.repository';
import {
  SearchClientsInput,
  SearchClientsUseCase,
} from './search-clients.use-case';

const CREATED_AT = new Date('2026-09-28T12:00:00.000Z');

function client(id: string, name: string, phone: string, barbershopId = 'a') {
  return Client.create({
    id,
    barbershopId,
    name,
    phone: PhoneNumber.create(phone),
    now: CREATED_AT,
  });
}

// Barbearia "a": Ana (user-ana) e Bruno (user-bruno). João tem agendamento só
// com Bruno, Maria só com Ana e Pedro nenhum.
async function setup() {
  const barbers = new InMemoryBarberRepository();
  const clients = new InMemoryClientRepository();
  await seedBarber(barbers, {
    id: 'ana',
    name: 'Ana',
    userId: 'user-ana',
    barbershopId: 'a',
  });
  await seedBarber(barbers, {
    id: 'bruno',
    name: 'Bruno',
    userId: 'user-bruno',
    barbershopId: 'a',
  });
  clients.add(client('joao', 'João Silva', '11987654321'));
  clients.add(client('maria', 'Maria', '21912345678'));
  clients.add(client('pedro', 'Pedro', '31912345678'));
  clients.add(client('joao-b', 'João Silva', '11987654321', 'b'));
  clients.linkToBarber('a', 'joao', 'bruno');
  clients.linkToBarber('a', 'maria', 'ana');
  const useCase = new SearchClientsUseCase(barbers, clients);
  const search = async (input: Partial<SearchClientsInput>) =>
    (
      await useCase.execute({
        barbershopId: 'a',
        userId: 'owner',
        role: 'owner',
        ...input,
      })
    ).map((found) => found.id);
  return { clients, search };
}

describe('SearchClientsUseCase', () => {
  it('CA-12.1: the owner searches every client of the barbershop by name', async () => {
    const { search } = await setup();

    expect(await search({ q: 'joão' })).toEqual(['joao']);
    expect(await search({})).toEqual(['joao', 'maria', 'pedro']);
  });

  it('CA-12.1: a term with 4 or more digits also matches the phone, a shorter one does not', async () => {
    const { search } = await setup();

    expect(await search({ q: '(11) 98765' })).toEqual(['joao']);
    expect(await search({ q: '987' })).toEqual([]);
  });

  it('CA-12.3 (C20): a barber only finds the clients with an appointment of their own barber', async () => {
    const { search } = await setup();

    expect(await search({ userId: 'user-bruno', role: 'barber' })).toEqual([
      'joao',
    ]);
    expect(
      await search({ userId: 'user-bruno', role: 'barber', q: 'Maria' }),
    ).toEqual([]);
  });

  it('CA-12.3 (C20): a barber user without a barber record finds nobody and the repository is not asked', async () => {
    const { clients, search } = await setup();

    expect(await search({ userId: 'user-caio', role: 'barber' })).toEqual([]);
    expect(clients.searches).toEqual([]);
  });

  it('CA-12.1: asks for at most 50 clients', async () => {
    const { clients, search } = await setup();

    await search({ q: 'Maria' });

    expect(clients.searches).toEqual([
      { name: 'Maria', phoneDigits: null, barberId: null, limit: 50 },
    ]);
  });
});

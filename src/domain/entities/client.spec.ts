import { InvalidValueError } from '../errors/invalid-value.error';
import { PhoneNumber } from '../value-objects/phone-number';
import { Client } from './client';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const NAME_MESSAGE = 'Informe o nome do cliente, com 2 a 80 caracteres.';

function createClient(name: string): Client {
  return Client.create({
    id: 'client-1',
    barbershopId: 'barbershop-a',
    name,
    phone: PhoneNumber.create('11987654321'),
    now: NOW,
  });
}

function describeClient(client: Client) {
  return {
    id: client.id,
    barbershopId: client.barbershopId,
    name: client.name,
    phone: client.phone,
    createdAt: client.createdAt,
  };
}

describe('Client', () => {
  it('CA-10.2: creates the client with the trimmed name and the E.164 phone', () => {
    expect(describeClient(createClient('  João  '))).toEqual({
      id: 'client-1',
      barbershopId: 'barbershop-a',
      name: 'João',
      phone: '+5511987654321',
      createdAt: NOW,
    });
  });

  it.each([
    ['2', 'Jo'],
    ['80', 'a'.repeat(80)],
  ])('CA-10.2: accepts a name with %s characters', (_length, name) => {
    expect(createClient(name).name).toBe(name);
  });

  it.each([
    ['1', 'J'],
    ['1 after trimming', '  J  '],
    ['81', 'a'.repeat(81)],
    ['81 after trimming', ` ${'a'.repeat(81)} `],
  ])('CA-10.2: rejects a name with %s characters', (_length, name) => {
    const act = () => createClient(name);

    expect(act).toThrow(InvalidValueError);
    expect(act).toThrow(NAME_MESSAGE);
  });

  it('CA-10.2: restore keeps every stored value', () => {
    const client = Client.restore({
      id: 'client-1',
      barbershopId: 'barbershop-a',
      name: 'João',
      phone: '+5511987654321',
      createdAt: NOW,
    });

    expect(describeClient(client)).toEqual({
      id: 'client-1',
      barbershopId: 'barbershop-a',
      name: 'João',
      phone: '+5511987654321',
      createdAt: NOW,
    });
  });
});

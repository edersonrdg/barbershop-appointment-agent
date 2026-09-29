import { Barbershop } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import { WhatsAppConnection } from '../../domain/entities/whatsapp-connection';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { CountingWhatsAppMetrics } from '../testing/counting-whatsapp-metrics';
import { FakeWhatsAppConnector } from '../testing/fake-whatsapp-connector';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryClientRepository } from '../testing/in-memory-client.repository';
import { InMemoryWhatsAppConnectionRepository } from '../testing/in-memory-whatsapp-connection.repository';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import { ReceiveWhatsAppMessageUseCase } from './receive-whatsapp-message.use-case';

const NOW = new Date('2026-09-29T15:00:00.000Z');
const POLICY_URL = 'https://barberbot.example/privacidade';
const PHONE = '+5511987654321';
const NOTICE =
  'Olá! Aqui é o assistente virtual da Barbearia do Zé. O atendimento é feito por inteligência artificial, e usamos seu nome e telefone para agendar seus horários. Política de privacidade: https://barberbot.example/privacidade';

function setup({ connected = true } = {}) {
  const store = new InMemoryAccountStore();
  const barbershop = Barbershop.startTrial({
    id: 'barbershop-a',
    name: 'Barbearia do Zé',
    now: NOW,
  });
  store.barbershops.push(barbershop);
  const connections = new InMemoryWhatsAppConnectionRepository();
  if (connected) {
    connections.rows.set(
      barbershop.id,
      WhatsAppConnection.restore({
        barbershopId: barbershop.id,
        status: 'connected',
        disconnectedAt: null,
        updatedAt: NOW,
      }),
    );
  }
  const clients = new InMemoryClientRepository();
  const connector = new FakeWhatsAppConnector();
  const metrics = new CountingWhatsAppMetrics();
  const useCase = new ReceiveWhatsAppMessageUseCase(
    connections,
    new InMemoryBarbershopRepository(store),
    clients,
    connector,
    metrics,
    new SequentialIdGenerator(),
    new FixedClock(NOW),
    POLICY_URL,
  );
  const receive = (profileName: string | null = 'João Silva') =>
    useCase.execute({ barbershopId: barbershop.id, phone: PHONE, profileName });
  return { receive, clients, connector, metrics, barbershop };
}

describe('ReceiveWhatsAppMessageUseCase', () => {
  const eighty = 'a'.repeat(80);

  it.each([
    ['absent', null, 'Cliente do WhatsApp'],
    ['empty', '', 'Cliente do WhatsApp'],
    ['one character after trimming', '  A  ', 'Cliente do WhatsApp'],
    ['only digits', '5511987654321', 'Cliente do WhatsApp'],
    ['surrounded by spaces', '  Ana  ', 'Ana'],
    ['two characters', 'Jo', 'Jo'],
    ['80 characters', eighty, eighty],
    ['81 characters', `${eighty}b`, eighty],
  ])(
    'CA-14.1 (C4): names the new client when the profile name is %s',
    async (_case, profileName, expected) => {
      const { receive, clients, barbershop } = setup();

      await receive(profileName);

      expect(clients.list(barbershop.id).map((client) => client.name)).toEqual([
        expected,
      ]);
    },
  );

  it('CA-14.1: creates the client with the phone and counts it', async () => {
    const { receive, clients, metrics, barbershop } = setup();

    await receive();

    const [client] = clients.list(barbershop.id);
    expect(client.phone).toBe(PHONE);
    expect(client.createdAt).toEqual(NOW);
    expect(metrics.clientsCreated).toBe(1);
  });

  it('CA-14.2: sends the privacy notice once and records when', async () => {
    const { receive, clients, connector, metrics, barbershop } = setup();

    await expect(receive()).resolves.toEqual({ outcome: 'sent' });
    await expect(receive()).resolves.toEqual({ outcome: 'none' });

    expect(connector.sentTexts).toEqual([
      { barbershopId: barbershop.id, phone: PHONE, text: NOTICE },
    ]);
    const [client] = clients.list(barbershop.id);
    expect(clients.privacyNoticeOf(client)).toEqual(NOW);
    expect(metrics.privacyNotices).toEqual(['sent']);
  });

  it('CA-14.1: keeps the name of a client created in the panel', async () => {
    const { receive, clients, barbershop } = setup();
    clients.add(
      Client.create({
        id: 'client-panel',
        barbershopId: barbershop.id,
        name: 'Carlos',
        phone: PhoneNumber.create(PHONE),
        now: NOW,
      }),
    );

    await receive('Carlão');

    expect(clients.list(barbershop.id).map((client) => client.name)).toEqual([
      'Carlos',
    ]);
  });

  it('CA-14.2: releases the claim when the notice cannot be sent', async () => {
    const { receive, clients, connector, metrics, barbershop } = setup();
    connector.failing.add('sendText');

    const result = await receive();

    expect(result.outcome).toBe('failed');
    const [client] = clients.list(barbershop.id);
    expect(clients.privacyNoticeOf(client)).toBeNull();
    expect(metrics.privacyNotices).toEqual(['failed']);

    connector.failing.clear();
    await expect(receive()).resolves.toEqual({ outcome: 'sent' });
  });

  it('CA-14.1: ignores a barbershop that never asked to connect', async () => {
    const { receive, clients, connector, barbershop } = setup({
      connected: false,
    });

    await expect(receive()).resolves.toEqual({ outcome: 'none' });

    expect(clients.list(barbershop.id)).toEqual([]);
    expect(connector.calls).toEqual([]);
  });
});

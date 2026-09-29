import { Barbershop } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import { WhatsAppConnection } from '../../domain/entities/whatsapp-connection';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { WeeklyOpeningHours } from '../../domain/value-objects/weekly-opening-hours';
import { MessageInterpretation } from '../ports/message-interpreter.port';
import { CountingWhatsAppMetrics } from '../testing/counting-whatsapp-metrics';
import { FakeMessageInterpreter } from '../testing/fake-message-interpreter';
import { FakeWhatsAppConnector } from '../testing/fake-whatsapp-connector';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryClientRepository } from '../testing/in-memory-client.repository';
import { InMemoryConversationRepository } from '../testing/in-memory-conversation.repository';
import { InMemoryInboundMessageRepository } from '../testing/in-memory-inbound-message.repository';
import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import { InMemoryWhatsAppConnectionRepository } from '../testing/in-memory-whatsapp-connection.repository';
import { seedService } from '../testing/service-fixtures';
import {
  AnswerClientQuestionUseCase,
  HANDOFF_REPLY,
} from './answer-client-question.use-case';
import { formatDuration, formatPrice } from './client-question-reply';

const NOW = new Date('2026-09-29T15:00:00.000Z');
const PHONE = '+5511987654321';
const SHOP = 'Barbearia do Zé';
const REFUSAL =
  'Desculpe, só posso ajudar com assuntos da Barbearia do Zé: serviços, preços, endereço e horário de funcionamento.';
const FALLBACK =
  'Posso te ajudar com serviços, preços, endereço e horário de funcionamento da Barbearia do Zé. O que você gostaria de saber?';
const UNAVAILABLE =
  'Desculpe, não consegui responder agora. Tente de novo em alguns instantes.';
const SERVICES_REPLY =
  'Na Barbearia do Zé:\n- Barba: R$ 30,00, 20 min\n- Corte: R$ 45,00, 30 min';

function interpretation(
  partial: Partial<MessageInterpretation>,
): MessageInterpretation {
  return {
    topics: [],
    services: [],
    unknownServices: [],
    offTopic: false,
    humanRequested: false,
    ...partial,
  };
}

const HOUR_MS = 60 * 60 * 1000;

async function setup({
  address = null,
  withServices = true,
  resumeAfterHours = 12,
}: {
  address?: string | null;
  withServices?: boolean;
  resumeAfterHours?: number;
} = {}) {
  const store = new InMemoryAccountStore();
  const barbershop = Barbershop.restore({
    id: 'barbershop-a',
    name: SHOP,
    address,
    timezone: BarbershopTimezone.create('America/Sao_Paulo'),
    openingHours: WeeklyOpeningHours.allClosed(),
    subscriptionStatus: 'trialing',
    trialEndsAt: NOW,
    createdAt: NOW,
  });
  store.barbershops.push(barbershop);
  const connections = new InMemoryWhatsAppConnectionRepository();
  connections.rows.set(
    barbershop.id,
    WhatsAppConnection.restore({
      barbershopId: barbershop.id,
      status: 'connected',
      disconnectedAt: null,
      updatedAt: NOW,
    }),
  );
  const services = new InMemoryServiceRepository();
  if (withServices) {
    await seedService(services, {
      id: 'corte',
      name: 'Corte',
      priceCents: 4500,
      durationMinutes: 30,
    });
    await seedService(services, {
      id: 'barba',
      name: 'Barba',
      priceCents: 3000,
      durationMinutes: 20,
    });
    await seedService(services, {
      id: 'hidratacao',
      name: 'Hidratação',
      priceCents: 6000,
      durationMinutes: 40,
      active: false,
    });
  }
  await seedService(services, {
    id: 'luzes',
    barbershopId: 'barbershop-b',
    name: 'Luzes',
  });
  const interpreter = new FakeMessageInterpreter();
  const connector = new FakeWhatsAppConnector();
  const clients = new InMemoryClientRepository();
  const client = Client.create({
    id: 'client-1',
    barbershopId: barbershop.id,
    name: 'João Silva',
    phone: PhoneNumber.create(PHONE),
    now: NOW,
  });
  clients.add(client);
  const conversations = new InMemoryConversationRepository();
  const metrics = new CountingWhatsAppMetrics();
  const useCase = new AnswerClientQuestionUseCase(
    connections,
    new InMemoryBarbershopRepository(store),
    services,
    new InMemoryInboundMessageRepository(),
    interpreter,
    connector,
    metrics,
    new FixedClock(NOW),
    clients,
    conversations,
    resumeAfterHours,
  );
  let nextId = 0;
  const reply = async (
    result: MessageInterpretation,
    text = 'quanto custa?',
  ): Promise<string[]> => {
    interpreter.next = result;
    nextId += 1;
    await useCase.execute({
      barbershopId: barbershop.id,
      phone: PHONE,
      messageId: `message-${nextId}`,
      text,
    });
    return connector.sentTexts.map((sent) => sent.text);
  };
  const conversation = () => conversations.row(barbershop.id, client.id);
  return {
    reply,
    interpreter,
    connector,
    conversations,
    conversation,
    metrics,
  };
}

describe('AnswerClientQuestionUseCase', () => {
  it.each([
    [0, 'R$ 0,00'],
    [5, 'R$ 0,05'],
    [4500, 'R$ 45,00'],
    [123450, 'R$ 1.234,50'],
    [1000000, 'R$ 10.000,00'],
  ])('AC 2 (C2): formats %i cents as %s', (cents, expected) => {
    expect(formatPrice(cents)).toBe(expected);
  });

  it.each([
    [5, '5 min'],
    [30, '30 min'],
    [60, '1h'],
    [90, '1h30'],
    [125, '2h05'],
    [480, '8h'],
  ])('AC 2 (C2): formats %i minutes as %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });

  it('CA-15.1 (C3): lists every active service when none is named', async () => {
    const { reply } = await setup();

    expect(await reply(interpretation({ topics: ['services'] }))).toEqual([
      SERVICES_REPLY,
    ]);
  });

  it('CA-15.2 (C4): lists the named service and says an unknown one is not offered', async () => {
    const { reply } = await setup();

    const texts = await reply(
      interpretation({
        topics: ['services'],
        services: ['Corte'],
        unknownServices: ['Pé e mão'],
      }),
    );

    expect(texts).toEqual([
      'Na Barbearia do Zé:\n- Corte: R$ 45,00, 30 min\nA Barbearia do Zé não oferece Pé e mão.',
    ]);
  });

  it.each([
    [
      'a different case',
      'corte',
      'Na Barbearia do Zé:\n- Corte: R$ 45,00, 30 min',
    ],
    ['inactive', 'Hidratação', 'A Barbearia do Zé não oferece Hidratação.'],
    ['of another barbershop', 'Luzes', 'A Barbearia do Zé não oferece Luzes.'],
  ])(
    'CA-15.2 (C5): matches a service named in %s against the active catalog',
    async (_case, name, expected) => {
      const { reply } = await setup();

      expect(
        await reply(interpretation({ topics: ['services'], services: [name] })),
      ).toEqual([expected]);
    },
  );

  it('AC 6 (C6): says the barbershop has no services yet', async () => {
    const { reply } = await setup({ withServices: false });

    expect(await reply(interpretation({ topics: ['services'] }))).toEqual([
      'A Barbearia do Zé ainda não tem serviços cadastrados.',
    ]);
  });

  it('RN-26 (C7): sends the interpreter only the active services of the barbershop', async () => {
    const { reply, interpreter } = await setup();

    await reply(interpretation({ topics: ['services'] }), 'tem luzes?');

    expect(interpreter.inputs).toEqual([
      {
        barbershopName: SHOP,
        serviceNames: ['Barba', 'Corte'],
        text: 'tem luzes?',
      },
    ]);
  });

  it('CA-15.4 (C9): says the address is not registered yet', async () => {
    const { reply } = await setup({ address: null });

    expect(await reply(interpretation({ topics: ['address'] }))).toEqual([
      'A Barbearia do Zé ainda não informou o endereço.',
    ]);
  });

  it('AC 11 (C11): sends one message with services, address and hours in this order', async () => {
    const { reply } = await setup({ address: 'Rua das Flores, 123' });

    const texts = await reply(
      interpretation({
        topics: ['opening_hours', 'address', 'services'],
        services: ['Corte'],
      }),
    );

    expect(texts).toEqual([
      [
        'Na Barbearia do Zé:\n- Corte: R$ 45,00, 30 min',
        'Endereço da Barbearia do Zé: Rua das Flores, 123',
        'Horário de funcionamento:\nSegunda-feira: fechado\nTerça-feira: fechado\nQuarta-feira: fechado\nQuinta-feira: fechado\nSexta-feira: fechado\nSábado: fechado\nDomingo: fechado',
      ].join('\n\n'),
    ]);
  });

  it('CA-15.3 (C13): offers help when the message has no topic', async () => {
    const { reply } = await setup();

    expect(await reply(interpretation({}))).toEqual([FALLBACK]);
  });

  it('CA-15.3: refuses an off-topic message even when a topic came along', async () => {
    const { reply } = await setup();

    expect(
      await reply(interpretation({ topics: ['services'], offTopic: true })),
    ).toEqual([REFUSAL]);
  });

  it.each([
    [1500, 1000],
    [1000, 1000],
  ])(
    'AC 19 (C20): a message of %i characters reaches the interpreter with %i',
    async (length, expected) => {
      const { reply, interpreter } = await setup();

      await reply(interpretation({}), 'a'.repeat(length));

      expect(interpreter.inputs[0].text).toHaveLength(expected);
    },
  );

  describe('US-16 hand-off', () => {
    it.each([
      [
        'topics',
        interpretation({
          topics: ['services', 'address'],
          services: ['Corte'],
          humanRequested: true,
        }),
      ],
      ['off-topic', interpretation({ offTopic: true, humanRequested: true })],
    ])(
      'AC 2 (C2): a request for a person with %s sends only the hand-off notice',
      async (_case, result) => {
        const { reply, conversation } = await setup({
          address: 'Rua das Flores, 123',
        });

        const texts = await reply(result);

        expect(texts).toEqual([HANDOFF_REPLY]);
        expect(texts[0]).not.toContain('R$');
        expect(texts[0]).not.toContain('Endereço');
        expect(conversation()).toMatchObject({
          pauseReason: 'requested',
          pausedAt: NOW,
        });
      },
    );

    it('CA-16.2 (C6): an answer and an off-topic refusal reset the failures', async () => {
      const { reply, conversation } = await setup({
        address: 'Rua das Flores, 123',
      });
      await reply(interpretation({}));
      expect(conversation()?.consecutiveFailures).toBe(1);

      await reply(interpretation({ topics: ['address'] }));
      expect(conversation()?.consecutiveFailures).toBe(0);

      await reply(interpretation({}));
      expect(conversation()?.consecutiveFailures).toBe(1);
      await reply(interpretation({ offTopic: true }));
      expect(conversation()?.consecutiveFailures).toBe(0);

      const texts = await reply(interpretation({}));
      expect(conversation()).toMatchObject({
        consecutiveFailures: 1,
        pausedAt: null,
      });
      expect(texts[texts.length - 1]).toBe(FALLBACK);
    });

    it('CA-16.2 (C7): an unavailable interpreter keeps the failure count', async () => {
      const { reply, interpreter, conversation } = await setup();
      await reply(interpretation({}));

      interpreter.failing = true;
      const texts = await reply(interpretation({}));
      expect(texts[texts.length - 1]).toBe(UNAVAILABLE);
      expect(conversation()).toMatchObject({
        consecutiveFailures: 1,
        pausedAt: null,
      });

      interpreter.failing = false;
      const after = await reply(interpretation({}));
      expect(after[after.length - 1]).toBe(HANDOFF_REPLY);
      expect(conversation()?.pauseReason).toBe('not_understood');
    });

    it.each([
      [2 * HOUR_MS + 60_000, true],
      [2 * HOUR_MS - 60_000, false],
    ])(
      'CA-16.5 (C20): with a 2 h deadline, a pause %i ms old answers: %s',
      async (age, answered) => {
        const { reply, conversations, conversation } = await setup({
          address: 'Rua das Flores, 123',
          resumeAfterHours: 2,
        });
        const pausedAt = new Date(NOW.getTime() - age);
        conversations.rows.set('barbershop-a:client-1', {
          consecutiveFailures: 1,
          pausedAt,
          pauseReason: 'requested',
          lastActivityAt: pausedAt,
        });

        const texts = await reply(interpretation({ topics: ['address'] }));

        expect(texts).toEqual(
          answered ? ['Endereço da Barbearia do Zé: Rua das Flores, 123'] : [],
        );
        expect(conversation()?.pausedAt).toEqual(answered ? null : pausedAt);
      },
    );
  });
});

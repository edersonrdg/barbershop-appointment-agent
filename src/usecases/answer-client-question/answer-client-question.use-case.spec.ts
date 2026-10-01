import { Barbershop } from '../../domain/entities/barbershop';
import { Client } from '../../domain/entities/client';
import { WhatsAppConnection } from '../../domain/entities/whatsapp-connection';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { WeeklyOpeningHours } from '../../domain/value-objects/weekly-opening-hours';
import { BookAppointmentUseCase } from '../book-appointment/book-appointment.use-case';
import { BookViaWhatsAppUseCase } from '../book-via-whatsapp/book-via-whatsapp.use-case';
import { ListAvailableSlotsUseCase } from '../list-available-slots/list-available-slots.use-case';
import { MessageInterpretation } from '../ports/message-interpreter.port';
import { CountingAppointmentMetrics } from '../testing/counting-appointment-metrics';
import { CountingWhatsAppMetrics } from '../testing/counting-whatsapp-metrics';
import { FakeMessageInterpreter } from '../testing/fake-message-interpreter';
import { FakeWhatsAppConnector } from '../testing/fake-whatsapp-connector';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryAppointmentRepository } from '../testing/in-memory-appointment.repository';
import { InMemoryBarberBlockRepository } from '../testing/in-memory-barber-block.repository';
import { InMemoryBarberRepository } from '../testing/in-memory-barber.repository';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryBookingRulesRepository } from '../testing/in-memory-booking-rules.repository';
import { InMemoryClientRepository } from '../testing/in-memory-client.repository';
import { InMemoryConversationRepository } from '../testing/in-memory-conversation.repository';
import { InMemoryInboundMessageRepository } from '../testing/in-memory-inbound-message.repository';
import { InMemoryNoShowLedger } from '../testing/in-memory-no-show-ledger';
import { InMemoryServiceRepository } from '../testing/in-memory-service.repository';
import { InMemoryWhatsAppConnectionRepository } from '../testing/in-memory-whatsapp-connection.repository';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import { seedService } from '../testing/service-fixtures';
import {
  BOOKING_NOW,
  CLIENT_PHONE,
  local,
  setupWhatsAppBooking,
  TOMORROW,
} from '../testing/whatsapp-booking-fixtures';
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
    bookingRequested: false,
    barber: null,
    anyBarber: false,
    date: null,
    period: null,
    time: null,
    choice: null,
    ...partial,
  };
}

const HOUR_MS = 60 * 60 * 1000;

// US-15/US-16 cases run with a barbershop without barbers: nothing is booked.
function bookingUseCase(
  barbershops: InMemoryBarbershopRepository,
  services: InMemoryServiceRepository,
  conversations: InMemoryConversationRepository,
  clock: FixedClock,
  store: InMemoryAccountStore,
): BookViaWhatsAppUseCase {
  const barbers = new InMemoryBarberRepository();
  const bookingRules = new InMemoryBookingRulesRepository(store);
  const appointments = new InMemoryAppointmentRepository();
  const blocks = new InMemoryBarberBlockRepository(barbers);
  const ids = new SequentialIdGenerator();
  return new BookViaWhatsAppUseCase(
    barbers,
    bookingRules,
    new InMemoryNoShowLedger(appointments),
    conversations,
    new ListAvailableSlotsUseCase(
      barbershops,
      bookingRules,
      barbers,
      services,
      appointments,
      blocks,
      clock,
    ),
    new BookAppointmentUseCase(
      barbershops,
      bookingRules,
      barbers,
      services,
      appointments,
      blocks,
      clock,
      ids,
      new CountingAppointmentMetrics(),
    ),
    ids,
  );
}

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
  const barbershops = new InMemoryBarbershopRepository(store);
  const clock = new FixedClock(NOW);
  const booking = bookingUseCase(
    barbershops,
    services,
    conversations,
    clock,
    store,
  );
  const useCase = new AnswerClientQuestionUseCase(
    connections,
    barbershops,
    services,
    new InMemoryInboundMessageRepository(),
    interpreter,
    connector,
    metrics,
    clock,
    clients,
    conversations,
    resumeAfterHours,
    booking,
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
  const execute = (result: MessageInterpretation, text = 'quanto custa?') => {
    interpreter.next = result;
    nextId += 1;
    return useCase.execute({
      barbershopId: barbershop.id,
      phone: PHONE,
      messageId: `message-${nextId}`,
      text,
    });
  };
  const conversation = () => conversations.row(barbershop.id, client.id);
  return {
    reply,
    execute,
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
        today: { date: '2026-09-29', weekday: 'terça-feira' },
        barberNames: [],
        offeredOptions: [],
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

    it('AC 27 (C26): returns the requested reason with the hand-off', async () => {
      const { execute } = await setup();

      await expect(
        execute(interpretation({ humanRequested: true })),
      ).resolves.toEqual({
        outcome: 'sent',
        kind: 'handoff',
        handoff: 'requested',
      });
    });

    it('AC 27 (C26): returns the not_understood reason with the hand-off', async () => {
      const { execute } = await setup();
      await execute(interpretation({}));

      await expect(execute(interpretation({}))).resolves.toEqual({
        outcome: 'sent',
        kind: 'handoff',
        handoff: 'not_understood',
      });
    });

    it('AC 3 (C3): a failed hand-off notice returns the error and the reason and keeps the pause', async () => {
      const { execute, connector, conversation } = await setup();
      connector.failing.add('sendText');

      const result = await execute(interpretation({ humanRequested: true }));

      expect(result).toMatchObject({ outcome: 'failed', handoff: 'requested' });
      expect(result.outcome === 'failed' && result.error).toBeInstanceOf(Error);
      expect(conversation()?.pausedAt).toEqual(NOW);
    });

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

  describe('US-17 booking', () => {
    const ADDRESS_REPLY = 'Endereço da Barbearia do Zé: Rua das Flores, 123';
    const OFFER_C1 =
      'Horários para Corte (R$ 45,00, 30 min):\n1. quarta-feira, 30/09, às 12:00, com João\n2. quarta-feira, 30/09, às 12:30, com João\n3. quarta-feira, 30/09, às 13:00, com João\nResponda com o número do horário que você quer.';
    const C1_REQUEST = {
      bookingRequested: true,
      services: ['Corte'],
      barber: 'João',
      date: TOMORROW,
      period: 'afternoon' as const,
    };

    async function bookingSetup() {
      const scenario = await setupWhatsAppBooking();
      const { barbershop, barbershops, services, clients, conversations } =
        scenario;
      const connections = new InMemoryWhatsAppConnectionRepository();
      connections.rows.set(
        barbershop.id,
        WhatsAppConnection.restore({
          barbershopId: barbershop.id,
          status: 'connected',
          disconnectedAt: null,
          updatedAt: BOOKING_NOW,
        }),
      );
      const interpreter = new FakeMessageInterpreter();
      const connector = new FakeWhatsAppConnector();
      const metrics = new CountingWhatsAppMetrics();
      const useCase = new AnswerClientQuestionUseCase(
        connections,
        barbershops,
        services,
        new InMemoryInboundMessageRepository(),
        interpreter,
        connector,
        metrics,
        scenario.clock,
        clients,
        conversations,
        12,
        scenario.booking,
      );
      let nextId = 0;
      const execute = (partial: Partial<MessageInterpretation>) => {
        interpreter.next = interpretation(partial);
        nextId += 1;
        return useCase.execute({
          barbershopId: barbershop.id,
          phone: CLIENT_PHONE,
          messageId: `message-${nextId}`,
          text: 'mensagem',
        });
      };
      const lastText = async (partial: Partial<MessageInterpretation>) => {
        const sent = connector.sentTexts.length;
        await execute(partial);
        const texts = connector.sentTexts.slice(sent).map((item) => item.text);
        return texts;
      };
      const conversation = () =>
        conversations.row(barbershop.id, scenario.client.id);
      return {
        ...scenario,
        interpreter,
        connector,
        metrics,
        execute,
        lastText,
        conversation,
      };
    }

    it('AC 13 (C13): sends the active barbers, today and the offered options to the interpreter', async () => {
      const { lastText, interpreter } = await bookingSetup();

      expect(await lastText(C1_REQUEST)).toEqual([OFFER_C1]);
      await lastText({});

      expect(interpreter.inputs[0]).toMatchObject({
        barberNames: ['João', 'Pedro'],
        today: { date: '2026-09-29', weekday: 'terça-feira' },
        offeredOptions: [],
      });
      expect(interpreter.inputs[1].offeredOptions).toEqual([
        'quarta-feira, 30/09, às 12:00, com João',
        'quarta-feira, 30/09, às 12:30, com João',
        'quarta-feira, 30/09, às 13:00, com João',
      ]);
    });

    it.each([
      ['no draft', null, false],
      ['a draft stored 61 min ago', 61, false],
      ['a draft stored 59 min ago', 59, true],
    ])('AC 20 (C20): a choice with %s books: %s', async (_case, age, books) => {
      const { lastText, conversation, bookedBy, client } = await bookingSetup();
      if (age !== null) {
        await lastText(C1_REQUEST);
        const row = conversation();
        if (row?.bookingDraft) {
          row.bookingDraft.updatedAt = new Date(
            BOOKING_NOW.getTime() - age * 60 * 1000,
          );
        }
      }

      const texts = await lastText({ choice: 1 });

      if (books) {
        expect(texts[0]).toMatch(/^Agendamento confirmado!/);
        expect(await bookedBy(client.id)).toHaveLength(1);
        return;
      }
      expect(texts).toEqual([
        'Posso te ajudar com serviços, preços, endereço e horário de funcionamento da Barbearia do Zé. O que você gostaria de saber?',
      ]);
      expect(conversation()?.consecutiveFailures).toBe(1);
      expect(await bookedBy(client.id)).toEqual([]);
    });

    it('AC 22 (C22): a summary that cannot be sent keeps the appointment', async () => {
      const { execute, connector, bookedBy, client } = await bookingSetup();
      await execute(C1_REQUEST);
      connector.failing.add('sendText');

      const result = await execute({ choice: 1 });

      const booked = await bookedBy(client.id);
      expect(booked).toHaveLength(1);
      expect(result).toMatchObject({
        outcome: 'failed',
        appointmentId: booked[0].id,
      });
      expect(result.outcome === 'failed' && result.error).toBeInstanceOf(Error);
    });

    it('AC 40 (C35): returns the appointment id with the summary', async () => {
      const { execute, bookedBy, client } = await bookingSetup();
      await execute(C1_REQUEST);

      const result = await execute({ choice: 1 });

      const [booked] = await bookedBy(client.id);
      expect(result).toEqual({
        outcome: 'sent',
        kind: 'booked',
        appointmentId: booked.id,
      });
    });

    it.each([
      ['a booking request', () => C1_REQUEST, false],
      ['a choice', () => ({ choice: 1 }), true],
    ])(
      'CA-17.6 (C30): a blocked client with %s is handed to the team',
      async (_case, partial, withOffer) => {
        const setup = await bookingSetup();
        const { lastText, noShows, conversation, bookedBy, client, metrics } =
          setup;
        if (withOffer) await lastText(C1_REQUEST);
        await noShows(2);

        expect(await lastText(partial())).toEqual([HANDOFF_REPLY]);
        expect(conversation()).toMatchObject({
          pauseReason: 'blocked_client',
          bookingDraft: null,
        });
        const booked = await bookedBy(client.id);
        expect(booked.filter((item) => item.status === 'confirmed')).toEqual(
          [],
        );
        expect(metrics.handoffs).toEqual(['blocked_client']);
      },
    );

    it('AC 32 (C31): a blocked client still gets the answers of US-15', async () => {
      const { lastText, noShows, conversation } = await bookingSetup();
      await noShows(2);

      expect(await lastText({ topics: ['address'] })).toEqual([ADDRESS_REPLY]);
      expect(conversation()?.pausedAt).toBeNull();
    });

    describe('AC 34 to AC 38 (C33): precedence with an offer in force', () => {
      it('a request for a person hands off and drops the draft', async () => {
        const { lastText, conversation } = await bookingSetup();
        await lastText(C1_REQUEST);

        expect(await lastText({ ...C1_REQUEST, humanRequested: true })).toEqual(
          [HANDOFF_REPLY],
        );
        expect(conversation()).toMatchObject({
          pauseReason: 'requested',
          bookingDraft: null,
        });
      });

      it('an off-topic message is refused and keeps the draft', async () => {
        const { lastText, conversation } = await bookingSetup();
        await lastText(C1_REQUEST);
        const draft = conversation()?.bookingDraft;

        expect(
          await lastText({ offTopic: true, bookingRequested: true }),
        ).toEqual([REFUSAL]);
        expect(conversation()?.bookingDraft).toEqual(draft);
      });

      it('a booking message with topics gets only the offer and resets the failures', async () => {
        const { lastText, conversation } = await bookingSetup();
        await lastText({});
        expect(conversation()?.consecutiveFailures).toBe(1);

        const texts = await lastText({
          bookingRequested: true,
          services: ['Corte'],
          barber: 'João',
          date: TOMORROW,
          topics: ['address'],
        });

        expect(texts).toHaveLength(1);
        expect(texts[0]).toMatch(/^Horários para Corte/);
        expect(texts[0]).not.toContain('Endereço');
        expect(conversation()?.consecutiveFailures).toBe(0);
      });

      it('a question with a draft is answered and keeps the draft', async () => {
        const { lastText, conversation } = await bookingSetup();
        await lastText(C1_REQUEST);
        const draft = conversation()?.bookingDraft;

        expect(await lastText({ topics: ['address'] })).toEqual([
          ADDRESS_REPLY,
        ]);
        expect(conversation()?.bookingDraft).toEqual(draft);
      });

      it('an unavailable interpreter keeps the draft and the failures', async () => {
        const { lastText, conversation, interpreter, busy, joao } =
          await bookingSetup();
        busy(joao.id, local(TOMORROW, '09:00'), local(TOMORROW, '09:30'));
        await lastText(C1_REQUEST);
        await lastText({ bookingRequested: false });
        const before = { ...conversation() };
        interpreter.failing = true;

        expect(await lastText(C1_REQUEST)).toEqual([
          'Desculpe, não consegui responder agora. Tente de novo em alguns instantes.',
        ]);
        expect(conversation()?.bookingDraft).toEqual(before.bookingDraft);
        expect(conversation()?.consecutiveFailures).toBe(
          before.consecutiveFailures,
        );
      });
    });
  });
});

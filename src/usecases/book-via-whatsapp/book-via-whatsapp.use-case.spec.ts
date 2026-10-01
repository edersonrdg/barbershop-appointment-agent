import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { MessageInterpretation } from '../ports/message-interpreter.port';
import { rulesWithMinimumAdvance } from '../testing/scheduling-fixtures';
import {
  local,
  setupWhatsAppBooking,
  TOMORROW,
} from '../testing/whatsapp-booking-fixtures';
import { BookingOutcome } from './book-via-whatsapp.use-case';

const TODAY = '2026-09-29';
const CORTE = 'Horários para Corte (R$ 45,00, 30 min):';
const FOOTER = 'Responda com o número do horário que você quer.';

function interpretation(
  partial: Partial<MessageInterpretation>,
): MessageInterpretation {
  return {
    topics: [],
    services: [],
    unknownServices: [],
    offTopic: false,
    humanRequested: false,
    bookingRequested: true,
    barber: null,
    anyBarber: false,
    date: null,
    period: null,
    time: null,
    choice: null,
    ...partial,
  };
}

function offer(lines: string[], header = CORTE): string {
  return [
    header,
    ...lines.map((line, index) => `${index + 1}. ${line}`),
    FOOTER,
  ].join('\n');
}

const wed = (time: string, barber = 'João') =>
  `quarta-feira, 30/09, às ${time}, com ${barber}`;
const tue = (time: string, barber = 'João') =>
  `terça-feira, 29/09, às ${time}, com ${barber}`;
const thu = (time: string, barber = 'João') =>
  `quinta-feira, 01/10, às ${time}, com ${barber}`;

const JOAO_AFTERNOON = {
  services: ['Corte'],
  barber: 'João',
  date: TOMORROW,
  period: 'afternoon' as const,
};

async function setup(options: Parameters<typeof setupWhatsAppBooking>[0] = {}) {
  const scenario = await setupWhatsAppBooking(options);
  const { barbershop, client, conversations, services, booking, clock } =
    scenario;
  await conversations.enter(barbershop.id, client.id, clock.now(), new Date(0));
  const send = async (
    partial: Partial<MessageInterpretation>,
  ): Promise<BookingOutcome> => {
    const now = clock.now();
    const preparation = await booking.prepare(barbershop, client.id, now);
    return booking.handle({
      barbershop,
      client,
      services: await services.listActiveByBarbershop(barbershop.id),
      preparation,
      interpretation: interpretation(partial),
      now,
    });
  };
  const text = async (
    partial: Partial<MessageInterpretation>,
  ): Promise<string> => {
    const outcome = await send(partial);
    if (outcome.type !== 'reply') {
      throw new Error(`Expected a reply, got ${outcome.type}`);
    }
    return outcome.text;
  };
  const draft = () =>
    conversations.row(barbershop.id, client.id)?.bookingDraft ?? null;
  return { ...scenario, send, text, draft };
}

describe('BookViaWhatsAppUseCase', () => {
  describe('US-17 offer', () => {
    it('CA-17.1 (C1): offers up to 3 afternoon slots of the named barber', async () => {
      const { text } = await setup();

      expect(await text(JOAO_AFTERNOON)).toBe(
        `${CORTE}\n1. quarta-feira, 30/09, às 12:00, com João\n2. quarta-feira, 30/09, às 12:30, com João\n3. quarta-feira, 30/09, às 13:00, com João\n${FOOTER}`,
      );
    });

    it.each([
      ['morning', false, [wed('09:00'), wed('09:30'), wed('10:00')]],
      ['evening', false, [wed('18:00'), wed('18:30')]],
      ['afternoon', true, [wed('17:30')]],
    ] as const)(
      'AC 2 (C2): the %s period (João blocked 12:00-17:30: %s) offers its slots only',
      async (period, blocked, lines) => {
        const { text, block, joao } = await setup();
        if (blocked) {
          block(joao.id, local(TOMORROW, '12:00'), local(TOMORROW, '17:30'));
        }

        expect(await text({ ...JOAO_AFTERNOON, period: period })).toBe(
          offer([...lines]),
        );
      },
    );

    it('AC 3 (C3): without a date, offers the first slots from now plus the minimum advance', async () => {
      const { text } = await setup();

      expect(await text({ services: ['Corte'], barber: 'João' })).toBe(
        offer([tue('13:00'), tue('13:30'), tue('14:00')]),
      );
    });

    it('CA-17.3 (C4): with no preference, offers the first free barber of each slot', async () => {
      const { text, busy, joao } = await setup();
      busy(joao.id, local(TOMORROW, '12:00'), local(TOMORROW, '13:00'));

      expect(
        await text({ ...JOAO_AFTERNOON, barber: null, anyBarber: true }),
      ).toBe(
        offer([wed('12:00', 'Pedro'), wed('12:30', 'Pedro'), wed('13:00')]),
      );
    });

    it('RF-03 (C5): asks for a barber preference before offering', async () => {
      const { text, draft } = await setup();

      expect(await text({ services: ['Corte'], date: TOMORROW })).toBe(
        'Tem preferência de barbeiro? Fazem Corte: João, Pedro. Se não tiver, responda "tanto faz".',
      );
      expect(draft()?.offer).toEqual([]);
    });

    it.each([[[]], [['Hidratação']]])(
      'AC 6 (C6): asks for the service when the message names %j',
      async (services) => {
        const { text } = await setup();

        expect(await text({ services })).toBe(
          'Qual serviço você quer agendar? Temos: Barba, Corte, Pigmentação.',
        );
      },
    );

    it('AC 7 (C7): says the named barber does not perform the service', async () => {
      const { text } = await setup();

      expect(await text({ services: ['Barba'], barber: 'Pedro' })).toBe(
        'Pedro não faz Barba. Fazem Barba: João. Se não tiver preferência, responda "tanto faz".',
      );
    });

    it('AC 8 (C8): says no barber performs the service and drops the draft', async () => {
      const { text, draft } = await setup();

      expect(await text({ services: ['Pigmentação'] })).toBe(
        'Nenhum barbeiro faz Pigmentação no momento.',
      );
      expect(draft()).toBeNull();
    });

    it('AC 9 (C9): combines the following messages with the draft', async () => {
      const { text } = await setup();

      expect(
        await text({
          services: ['Corte'],
          date: TOMORROW,
          period: 'afternoon',
        }),
      ).toContain('Tem preferência de barbeiro?');
      expect(await text({ anyBarber: true })).toBe(
        offer([wed('12:00'), wed('12:30'), wed('13:00')]),
      );
      expect(await text({ date: '2026-10-01' })).toBe(
        offer([thu('12:00'), thu('12:30'), thu('13:00')]),
      );
    });

    it('AC 10 (C10): offers a free exact time as the only option', async () => {
      const { text, busy, joao } = await setup();

      expect(await text({ ...JOAO_AFTERNOON, time: '15:00' })).toBe(
        offer([wed('15:00')]),
      );

      busy(joao.id, local(TOMORROW, '15:00'), local(TOMORROW, '15:30'));
      expect(
        await text({
          ...JOAO_AFTERNOON,
          barber: null,
          anyBarber: true,
          time: '15:00',
        }),
      ).toBe(offer([wed('15:00', 'Pedro')]));
    });

    it('AC 11 (C11): says a taken exact time is not free and offers the same period', async () => {
      const { text, busy, joao } = await setup();
      busy(joao.id, local(TOMORROW, '15:00'), local(TOMORROW, '15:30'));

      expect(
        await text({
          services: ['Corte'],
          barber: 'João',
          date: TOMORROW,
          time: '15:00',
        }),
      ).toBe(
        `O horário das 15:00 de quarta-feira, 30/09 não está livre.\n\n${offer([wed('12:00'), wed('12:30'), wed('13:00')])}`,
      );
    });

    it('AC 12 (C12): says a past date has passed and offers from now', async () => {
      const { text } = await setup();

      expect(
        await text({ services: ['Corte'], barber: 'João', date: '2026-09-28' }),
      ).toBe(
        `Essa data já passou.\n\n${offer([tue('13:00'), tue('13:30'), tue('14:00')])}`,
      );
    });

    it('AC 14 (C14): stores the offer in the order shown', async () => {
      const { text, draft, busy, joao } = await setup();
      busy(joao.id, local(TOMORROW, '12:00'), local(TOMORROW, '13:00'));

      await text({ ...JOAO_AFTERNOON, barber: null, anyBarber: true });

      expect(draft()).toMatchObject({
        serviceIds: ['corte'],
        anyBarber: true,
        offer: [
          { barberId: 'pedro', startsAt: new Date('2026-09-30T15:00:00.000Z') },
          { barberId: 'pedro', startsAt: new Date('2026-09-30T15:30:00.000Z') },
          { barberId: 'joao', startsAt: new Date('2026-09-30T16:00:00.000Z') },
        ],
      });
    });
  });

  describe('US-17 choice', () => {
    it('CA-17.2 (C15): books the chosen option as a confirmed bot appointment', async () => {
      const { text, send, bookedBy, client } = await setup();
      await text(JOAO_AFTERNOON);

      const outcome = await send({ bookingRequested: false, choice: 2 });

      const booked = await bookedBy(client.id);
      expect(booked).toHaveLength(1);
      expect(booked[0]).toMatchObject({
        status: 'confirmed',
        origin: 'bot',
        clientId: 'carlos',
        barberId: 'joao',
        serviceIds: ['corte'],
        startsAt: new Date('2026-09-30T15:30:00.000Z'),
        endsAt: new Date('2026-09-30T16:00:00.000Z'),
      });
      expect(outcome).toMatchObject({
        type: 'reply',
        kind: 'booked',
        appointmentId: booked[0].id,
      });
    });

    it('CA-17.2 (C16): answers with the summary and drops the draft', async () => {
      const { text, draft } = await setup();
      await text(JOAO_AFTERNOON);

      expect(await text({ bookingRequested: false, choice: 2 })).toBe(
        'Agendamento confirmado!\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 12:30\nValor: R$ 45,00\nEndereço: Rua das Flores, 123',
      );
      expect(draft()).toBeNull();
    });

    it('AC 17 (C17): sums the prices and durations of several services', async () => {
      const { text, bookedBy, client } = await setup();

      expect(
        await text({ ...JOAO_AFTERNOON, services: ['Corte', 'Barba'] }),
      ).toMatch(/^Horários para Corte \+ Barba \(R\$ 75,00, 50 min\):\n/);
      const summary = await text({ bookingRequested: false, choice: 1 });

      expect(summary).toContain('\nServiços: Corte, Barba\n');
      expect(summary).toContain('\nValor: R$ 75,00\n');
      const [booked] = await bookedBy(client.id);
      expect(booked.endsAt.getTime() - booked.startsAt.getTime()).toBe(
        50 * 60 * 1000,
      );
    });

    it('AC 18 (C18): says the address is not informed yet', async () => {
      const { text } = await setup({ address: null });
      await text(JOAO_AFTERNOON);

      expect(await text({ bookingRequested: false, choice: 1 })).toMatch(
        /\nEndereço: ainda não informado$/,
      );
    });

    it('AC 19 (C19): repeats the offer for an option it does not have', async () => {
      const { text, draft, bookedBy, client } = await setup();
      await text({ ...JOAO_AFTERNOON, period: 'evening' });
      const before = draft();

      expect(await text({ bookingRequested: false, choice: 3 })).toBe(
        `Não encontrei essa opção.\n\n${offer([wed('18:00'), wed('18:30')])}`,
      );
      expect(await bookedBy(client.id)).toEqual([]);
      expect(draft()).toEqual(before);
    });
  });

  describe('US-17 slot taken', () => {
    it('CA-17.4 (C23): a slot taken after the offer gets new options', async () => {
      const { text, busy, joao, bookedBy, client } = await setup();
      await text(JOAO_AFTERNOON);
      busy(joao.id, local(TOMORROW, '12:00'), local(TOMORROW, '12:30'));

      expect(await text({ bookingRequested: false, choice: 1 })).toBe(
        `Esse horário acabou de ser ocupado.\n\n${offer([wed('12:30'), wed('13:00'), wed('13:30')])}`,
      );
      expect(await bookedBy(client.id)).toEqual([]);
    });

    it('CA-17.4 (C23): a conflict raised by the exclusion constraint gets new options', async () => {
      const { text, appointments, bookedBy, client } = await setup();
      await text(JOAO_AFTERNOON);
      jest
        .spyOn(appointments, 'create')
        .mockRejectedValueOnce(new AppointmentConflictError('RN-07'));

      expect(await text({ bookingRequested: false, choice: 1 })).toMatch(
        /^Esse horário acabou de ser ocupado\.\n\nHorários para Corte/,
      );
      expect(await bookedBy(client.id)).toEqual([]);
    });

    it('AC 24 (C24): a slot blocked after the offer gets new options', async () => {
      const { text, block, joao, bookedBy, client } = await setup();
      await text(JOAO_AFTERNOON);
      block(joao.id, local(TOMORROW, '12:00'), local(TOMORROW, '13:00'));

      expect(await text({ bookingRequested: false, choice: 1 })).toBe(
        `Esse horário acabou de ser ocupado.\n\n${offer([wed('13:00'), wed('13:30'), wed('14:00')])}`,
      );
      expect(await bookedBy(client.id)).toEqual([]);
    });
  });

  describe('US-17 minimum advance', () => {
    it.each([
      [
        60,
        'Só agendamos pelo WhatsApp com pelo menos 1h de antecedência.\n\n' +
          offer([tue('13:00')]),
      ],
      [30, offer([tue('12:30')])],
      [
        90,
        'Só agendamos pelo WhatsApp com pelo menos 1h30 de antecedência.\n\n' +
          offer([tue('13:30')]),
      ],
    ])(
      'CA-17.5 (C25): with %i min of advance, a request for 12:30 today answers as expected',
      async (minutes, expected) => {
        const { text, store, barbershop } = await setup();
        store.bookingRules.set(barbershop.id, rulesWithMinimumAdvance(minutes));

        expect(
          await text({
            services: ['Corte'],
            barber: 'João',
            date: TODAY,
            time: '12:30',
          }),
        ).toBe(expected);
      },
    );

    it('AC 26 (C26): an option that fell inside the minimum advance is not booked', async () => {
      const { text, clock, bookedBy, client } = await setup();
      await text({
        services: ['Corte'],
        barber: 'João',
        date: TODAY,
        time: '13:00',
      });
      clock.current = new Date('2026-09-29T15:01:00.000Z');

      expect(await text({ bookingRequested: false, choice: 1 })).toBe(
        `Só agendamos pelo WhatsApp com pelo menos 1h de antecedência.\n\n${offer([tue('13:30')])}`,
      );
      expect(await bookedBy(client.id)).toEqual([]);
    });
  });

  describe('US-17 no slot in the period', () => {
    it.each([
      [
        'afternoon',
        ['12:00', '18:00'],
        'Não há horário livre à tarde em quarta-feira, 30/09.',
        [wed('09:00'), wed('09:30'), wed('10:00')],
      ],
      [
        'morning',
        ['09:00', '12:00'],
        'Não há horário livre de manhã em quarta-feira, 30/09.',
        [wed('12:00'), wed('12:30'), wed('13:00')],
      ],
    ] as const)(
      'CA-17.7 (C27): an empty %s offers the other periods',
      async (period, [from, to], notice, lines) => {
        const { text, block, joao } = await setup();
        block(joao.id, local(TOMORROW, from), local(TOMORROW, to));

        expect(await text({ ...JOAO_AFTERNOON, period: period })).toBe(
          `${notice}\n\n${offer([...lines])}`,
        );
      },
    );

    it('AC 29 (C28): an empty date offers the following days', async () => {
      const { text, block, joao } = await setup();
      block(joao.id, local(TOMORROW, '09:00'), local(TOMORROW, '19:00'));

      expect(
        await text({ services: ['Corte'], barber: 'João', date: TOMORROW }),
      ).toBe(
        `Não há horário livre em quarta-feira, 30/09.\n\n${offer([thu('09:00'), thu('09:30'), thu('10:00')])}`,
      );
    });

    it('AC 30 (C29): says nothing is free in the 7 days and keeps no offer', async () => {
      const { text, block, joao, draft } = await setup();
      block(joao.id, local(TODAY, '09:00'), local('2026-10-06', '19:00'));

      expect(await text({ services: ['Corte'], barber: 'João' })).toBe(
        'Não encontrei horário livre para Corte até segunda-feira, 05/10.',
      );
      expect(draft()?.offer).toEqual([]);

      expect(
        await text({ services: ['Corte'], barber: 'João', date: TOMORROW }),
      ).toMatch(
        /Não encontrei horário livre para Corte até terça-feira, 06\/10\.$/,
      );
    });
  });
});

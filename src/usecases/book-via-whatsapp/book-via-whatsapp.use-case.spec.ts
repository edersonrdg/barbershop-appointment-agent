import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { BookingRules } from '../../domain/value-objects/booking-rules';
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
    cancelRequested: false,
    rescheduleRequested: false,
    confirmRequested: false,
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

describe('BookViaWhatsAppUseCase US-18', () => {
  const LIST_HEADER = 'Você tem mais de um agendamento. Qual deles?';
  const LIST_FOOTER = 'Responda com o número do agendamento.';
  const A_LINE = 'Corte, terça-feira, 29/09, às 15:00, com João';
  const B_LINE = 'Barba, quarta-feira, 30/09, às 10:00, com João';
  const LIST = [LIST_HEADER, `1. ${A_LINE}`, `2. ${B_LINE}`, LIST_FOOTER].join(
    '\n',
  );
  const CANCEL = { bookingRequested: false, cancelRequested: true };
  const RESCHEDULE = { bookingRequested: false, rescheduleRequested: true };
  const CHOICE = (choice: number) => ({ bookingRequested: false, choice });
  const A_CANCELLED =
    'Agendamento cancelado.\nServiço: Corte\nBarbeiro: João\nData: terça-feira, 29/09\nHorário: 15:00';

  function rules(cancellationDeadlineMinutes: number) {
    return BookingRules.create({
      minimumAdvanceMinutes: 60,
      cancellationDeadlineMinutes,
      noShowLimit: 2,
      waitlistOfferMinutes: 15,
      returnReminderDays: 30,
    });
  }

  async function withA() {
    const scenario = await setup();
    await scenario.own({ id: 'A', startsAt: local(TODAY, '15:00') });
    return scenario;
  }

  async function withAB() {
    const scenario = await setup();
    await scenario.own({
      id: 'B',
      startsAt: local(TOMORROW, '10:00'),
      serviceIds: ['barba'],
    });
    await scenario.own({ id: 'A', startsAt: local(TODAY, '15:00') });
    return scenario;
  }

  async function withR() {
    const scenario = await setup();
    await scenario.own({ id: 'R', startsAt: local(TODAY, '17:00') });
    return scenario;
  }

  describe('US-18 locate and disambiguate', () => {
    it('CA-18.2 (C2): lists the upcoming confirmed appointments of the client in order and saves them', async () => {
      const scenario = await withAB();
      const { own, text, draft } = scenario;
      await own({
        id: 'past',
        startsAt: local('2026-09-20', '10:00'),
        status: 'attended',
      });
      await own({
        id: 'gone',
        startsAt: local(TOMORROW, '15:00'),
        status: 'cancelled',
      });
      await own({
        id: 'other',
        startsAt: local(TOMORROW, '16:00'),
        clientId: 'someone-else',
      });
      await own({
        id: 'shop-b',
        startsAt: local(TOMORROW, '11:00'),
        barbershopId: 'barbershop-b',
        barberId: 'marcos',
      });

      expect(await text(CANCEL)).toBe(LIST);
      expect(draft()).toMatchObject({
        action: 'cancel',
        targetAppointmentId: null,
        candidates: [
          {
            appointmentId: 'A',
            barberId: 'joao',
            startsAt: local(TODAY, '15:00'),
          },
          {
            appointmentId: 'B',
            barberId: 'joao',
            startsAt: local(TOMORROW, '10:00'),
          },
        ],
      });
    });

    it.each([
      ['cancel', CANCEL],
      ['reschedule', RESCHEDULE],
    ])(
      'AC 2 (C3): to %s without an upcoming appointment answers so',
      async (_action, request) => {
        const { own, text, draft } = await setup();
        await own({
          id: 'past',
          startsAt: local('2026-09-20', '10:00'),
          status: 'attended',
        });
        await own({
          id: 'gone',
          startsAt: local(TOMORROW, '15:00'),
          status: 'cancelled',
        });

        expect(await text(request)).toBe(
          'Você não tem nenhum agendamento futuro.',
        );
        expect(draft()).toBeNull();
      },
    );

    it('door 5 (C4): lists at most the 10 nearest appointments', async () => {
      const { own, text, draft } = await setup();
      for (let index = 0; index < 11; index += 1) {
        const day = `2026-10-${String(index + 1).padStart(2, '0')}`;
        await own({
          id: `appointment-${index + 1}`,
          startsAt: local(day, '10:00'),
        });
      }

      const lines = (await text(CANCEL)).split('\n');

      expect(lines).toHaveLength(12);
      expect(lines[10]).toMatch(/^10\. /);
      expect(
        (draft()?.candidates ?? []).map((candidate) => candidate.appointmentId),
      ).not.toContain('appointment-11');
      expect(draft()?.candidates).toHaveLength(10);
    });

    it('AC 5 (C5): the chosen appointment of the list is the one cancelled', async () => {
      const { text, statusOf } = await withAB();
      await text(CANCEL);

      expect(await text(CHOICE(2))).toBe(
        'Agendamento cancelado.\nServiço: Barba\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 10:00',
      );
      expect(await statusOf('B')).toBe('cancelled');
      expect(await statusOf('A')).toBe('confirmed');
    });

    it('AC 6 (C6): a choice outside the list repeats it and changes nothing', async () => {
      const { text, statusOf, draft } = await withAB();
      await text(CANCEL);

      expect(await text(CHOICE(3))).toBe(
        `Não encontrei essa opção.\n\n${LIST}`,
      );
      expect(await statusOf('A')).toBe('confirmed');
      expect(await statusOf('B')).toBe('confirmed');
      expect(draft()?.candidates).toHaveLength(2);
    });
  });

  describe('US-18 cancel', () => {
    it('CA-18.1 (C8): the only upcoming appointment is cancelled without asking', async () => {
      const { text, statusOf, draft } = await withA();

      expect(await text(CANCEL)).toBe(A_CANCELLED);
      expect(await statusOf('A')).toBe('cancelled');
      expect(draft()).toBeNull();
    });

    it('CA-18.1 (C8): names every service of the cancelled appointment', async () => {
      const { own, text } = await setup();
      await own({
        id: 'A',
        startsAt: local(TODAY, '15:00'),
        serviceIds: ['corte', 'barba'],
      });

      expect((await text(CANCEL)).split('\n')[1]).toBe(
        'Serviços: Corte, Barba',
      );
    });

    it('CA-18.5 (C9): the cancelled slot is offered again', async () => {
      const { text, listSlots, barbershop, joao } = await withA();
      const slotsAt15 = async () =>
        (
          await listSlots.execute({
            barbershopId: barbershop.id,
            barberId: joao.id,
            serviceIds: ['corte'],
            date: TODAY,
            origin: 'bot',
          })
        ).filter(
          (slot) => slot.startsAt.getTime() === local(TODAY, '15:00').getTime(),
        );

      expect(await slotsAt15()).toEqual([]);
      await text(CANCEL);
      expect(await slotsAt15()).toHaveLength(1);
    });

    it.each([
      [120, '14:00', true],
      [120, '13:55', false],
      [30, '12:30', true],
    ])(
      'RN-09 (C10): with a deadline of %i min, an appointment at %s is cancelled: %s',
      async (deadline, time, cancels) => {
        const { own, send, statusOf, store, barbershop } = await setup();
        store.bookingRules.set(barbershop.id, rules(deadline));
        await own({ id: 'A', startsAt: local(TODAY, time) });

        const outcome = await send(CANCEL);

        if (cancels) {
          expect(outcome).toMatchObject({ type: 'reply', kind: 'cancelled' });
          expect(await statusOf('A')).toBe('cancelled');
        } else {
          expect(outcome).toMatchObject({
            type: 'handoff',
            reason: 'late_cancellation',
          });
          expect(await statusOf('A')).toBe('confirmed');
        }
      },
    );
  });

  describe('US-18 reschedule', () => {
    const TOMORROW_MORNING = {
      ...RESCHEDULE,
      date: TOMORROW,
      period: 'morning' as const,
    };

    it('CA-18.3 (C13): offers slots for the services and barber of the appointment', async () => {
      const { text, draft, statusOf } = await withR();

      expect(await text(TOMORROW_MORNING)).toBe(
        offer([wed('09:00'), wed('09:30'), wed('10:00')]),
      );
      expect(draft()).toMatchObject({
        action: 'reschedule',
        targetAppointmentId: 'R',
        serviceIds: ['corte'],
        barberId: 'joao',
        candidates: [],
      });
      expect(draft()?.offer).toHaveLength(3);
      expect(await statusOf('R')).toBe('confirmed');
    });

    it.each([
      [
        'no preference',
        { anyBarber: true },
        [wed('09:00', 'Pedro'), wed('09:30', 'Pedro'), wed('10:00')],
      ],
      [
        'another barber',
        { barber: 'Pedro' },
        [wed('09:00', 'Pedro'), wed('09:30', 'Pedro'), wed('10:00', 'Pedro')],
      ],
    ])('AC 11 (C14): with %s', async (_case, extra, lines) => {
      const { text, busy, joao } = await withR();
      busy(joao.id, local(TOMORROW, '09:00'), local(TOMORROW, '10:00'));

      expect(await text({ ...TOMORROW_MORNING, ...extra })).toBe(offer(lines));
    });

    it('CA-18.3 (C15): the chosen slot is booked and only then the old one cancelled', async () => {
      const { text, statusOf, bookedBy, client, draft } = await withR();
      await text(TOMORROW_MORNING);

      expect(await text(CHOICE(1))).toBe(
        'Agendamento remarcado!\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 09:00\nValor: R$ 45,00\nEndereço: Rua das Flores, 123',
      );
      const created = (await bookedBy(client.id)).filter(
        (appointment) => appointment.id !== 'R',
      );
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        status: 'confirmed',
        origin: 'bot',
        barberId: 'joao',
        serviceIds: ['corte'],
        startsAt: new Date('2026-09-30T12:00:00.000Z'),
        endsAt: new Date('2026-09-30T12:30:00.000Z'),
      });
      expect(await statusOf('R')).toBe('cancelled');
      expect(draft()).toBeNull();
    });

    it('AC 14 (C16): counts one bot booking and one cancellation', async () => {
      const { text, appointmentMetrics } = await withR();
      await text(TOMORROW_MORNING);
      await text(CHOICE(1));

      expect(appointmentMetrics.bookings).toEqual(['bot']);
      expect(appointmentMetrics.cancellations).toEqual(['bot']);
    });

    it('AC 11 (C18): a following message refines the search of the same appointment', async () => {
      const { text, draft, statusOf, bookedBy, client } = await withR();
      await text(TOMORROW_MORNING);

      expect(await text({ bookingRequested: true, date: '2026-10-01' })).toBe(
        offer([thu('09:00'), thu('09:30'), thu('10:00')]),
      );
      expect(draft()).toMatchObject({
        action: 'reschedule',
        targetAppointmentId: 'R',
      });
      await text(CHOICE(2));
      const created = (await bookedBy(client.id)).filter(
        (appointment) => appointment.id !== 'R',
      );
      expect(created.map((appointment) => appointment.startsAt)).toEqual([
        local('2026-10-01', '09:30'),
      ]);
      expect(await statusOf('R')).toBe('cancelled');
    });
  });

  describe('US-18 past the deadline', () => {
    it.each([
      [120, '2h'],
      [30, '30 min'],
      [90, '1h30'],
    ])(
      'AC 17 (C20): a deadline of %i min is written as %s',
      async (deadline, written) => {
        const { own, send, store, barbershop } = await setup();
        store.bookingRules.set(barbershop.id, rules(deadline));
        await own({ id: 'A', startsAt: local(TODAY, '12:20') });

        expect(await send(CANCEL)).toEqual({
          type: 'handoff',
          reason: 'late_cancellation',
          notice: `Só cancelamos ou remarcamos pelo WhatsApp com pelo menos ${written} de antecedência.`,
        });
      },
    );

    it('CA-18.4 (C21): a listed appointment past the deadline is handed to the team', async () => {
      const { own, send, statusOf } = await withA();
      await own({ id: 'L', startsAt: local(TODAY, '13:00') });

      const list = await send(CANCEL);
      expect(list).toMatchObject({
        type: 'reply',
        text: [
          LIST_HEADER,
          '1. Corte, terça-feira, 29/09, às 13:00, com João',
          `2. ${A_LINE}`,
          LIST_FOOTER,
        ].join('\n'),
      });
      expect(await send(CHOICE(1))).toEqual({
        type: 'handoff',
        reason: 'late_cancellation',
        notice:
          'Só cancelamos ou remarcamos pelo WhatsApp com pelo menos 2h de antecedência.',
      });
      expect(await statusOf('L')).toBe('confirmed');
    });
  });

  describe('US-18 reschedule slot taken or late', () => {
    it('AC 19 (C23): a slot taken after the offer gets new options and keeps the old appointment', async () => {
      const { text, busy, joao, statusOf, bookedBy, client } = await withR();
      await text({ ...RESCHEDULE, date: TOMORROW, period: 'morning' });
      busy(joao.id, local(TOMORROW, '09:00'), local(TOMORROW, '09:30'));

      expect(await text(CHOICE(1))).toBe(
        `Esse horário acabou de ser ocupado.\n\n${offer([wed('09:30'), wed('10:00'), wed('10:30')])}`,
      );
      expect((await bookedBy(client.id)).map((item) => item.id)).toEqual(['R']);
      expect(await statusOf('R')).toBe('confirmed');
    });

    it('AC 19 (C23): a conflict raised by the exclusion constraint keeps the old appointment', async () => {
      const { text, appointments, statusOf } = await withR();
      await text({ ...RESCHEDULE, date: TOMORROW, period: 'morning' });
      jest
        .spyOn(appointments, 'create')
        .mockRejectedValueOnce(new AppointmentConflictError('RN-07'));

      expect(await text(CHOICE(1))).toMatch(
        /^Esse horário acabou de ser ocupado\.\n\nHorários para Corte/,
      );
      expect(await statusOf('R')).toBe('confirmed');
    });

    it('AC 20 (C24): an option that fell inside the minimum advance keeps the old appointment', async () => {
      const { text, clock, statusOf, bookedBy, client } = await withR();

      expect(await text(RESCHEDULE)).toBe(
        offer([tue('13:00'), tue('13:30'), tue('14:00')]),
      );
      clock.current = new Date('2026-09-29T15:01:00.000Z');

      expect(await text(CHOICE(1))).toBe(
        `Só agendamos pelo WhatsApp com pelo menos 1h de antecedência.\n\n${offer([tue('13:30')])}`,
      );
      expect((await bookedBy(client.id)).map((item) => item.id)).toEqual(['R']);
      expect(await statusOf('R')).toBe('confirmed');
    });
  });

  describe('US-18 a new request replaces the draft', () => {
    it('Assumptions (C28): a cancellation drops a booking offer in progress', async () => {
      const { text, statusOf, draft } = await withA();
      await text(JOAO_AFTERNOON);

      expect(await text(CANCEL)).toBe(A_CANCELLED);
      expect(await statusOf('A')).toBe('cancelled');
      expect(draft()).toBeNull();
    });

    it('Assumptions (C28): a booking request drops the list of appointments', async () => {
      const { text, draft } = await withAB();
      await text(CANCEL);

      expect(await text(JOAO_AFTERNOON)).toBe(
        offer([wed('12:00'), wed('12:30'), wed('13:00')]),
      );
      expect(draft()).toMatchObject({ action: 'book', candidates: [] });
    });
  });
});

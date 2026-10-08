import { BarbershopService } from '../../domain/entities/barbershop-service';
import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { ServiceDuration } from '../../domain/value-objects/service-duration';
import { ServicePrice } from '../../domain/value-objects/service-price';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { MessageInterpretation } from '../ports/message-interpreter.port';
import { rulesWithMinimumAdvance } from '../testing/scheduling-fixtures';
import { describeService, seedService } from '../testing/service-fixtures';
import {
  local,
  setupWhatsAppBooking,
  TOMORROW,
} from '../testing/whatsapp-booking-fixtures';
import { FREED_AT, setupWaitlist } from '../testing/waitlist-fixtures';
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
    addOnAccepted: false,
    waitlistAccepted: false,
    offerDeclined: false,
    returnReminder: null,
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

const waitlistProposal = (label: string) =>
  `Se preferir, posso te colocar na lista de espera para ${label} e te aviso se vagar um horário. Responda "lista de espera" para entrar.`;

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

async function withSend<
  T extends Awaited<ReturnType<typeof setupWhatsAppBooking>>,
>(scenario: T) {
  const { barbershop, client, conversations, services, booking, clock } =
    scenario;
  await conversations.enter(barbershop.id, client.id, clock.now(), new Date(0));
  const prepare = async () =>
    booking.prepare(
      barbershop,
      client.id,
      clock.now(),
      await services.listActiveByBarbershop(barbershop.id),
    );
  const send = async (
    partial: Partial<MessageInterpretation>,
  ): Promise<BookingOutcome> => {
    const now = clock.now();
    const active = await services.listActiveByBarbershop(barbershop.id);
    const preparation = await booking.prepare(
      barbershop,
      client.id,
      now,
      active,
    );
    return booking.handle({
      barbershop,
      client,
      services: active,
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
  return { ...scenario, prepare, send, text, draft };
}

async function setup(options: Parameters<typeof setupWhatsAppBooking>[0] = {}) {
  return withSend(await setupWhatsAppBooking(options));
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
        'Corte à tarde em quarta-feira, 30/09',
      ],
      [
        'morning',
        ['09:00', '12:00'],
        'Não há horário livre de manhã em quarta-feira, 30/09.',
        [wed('12:00'), wed('12:30'), wed('13:00')],
        'Corte de manhã em quarta-feira, 30/09',
      ],
    ] as const)(
      'CA-17.7 (C27): an empty %s offers the other periods',
      async (period, [from, to], notice, lines, waiting) => {
        const { text, block, joao } = await setup();
        block(joao.id, local(TOMORROW, from), local(TOMORROW, to));

        // US-24 (CA-24.1): the reply also proposes the waitlist.
        expect(await text({ ...JOAO_AFTERNOON, period: period })).toBe(
          `${notice}\n\n${offer([...lines])}\n\n${waitlistProposal(waiting)}`,
        );
      },
    );

    it('AC 29 (C28): an empty date offers the following days', async () => {
      const { text, block, joao } = await setup();
      block(joao.id, local(TOMORROW, '09:00'), local(TOMORROW, '19:00'));

      expect(
        await text({ services: ['Corte'], barber: 'João', date: TOMORROW }),
      ).toBe(
        `Não há horário livre em quarta-feira, 30/09.\n\n${offer([thu('09:00'), thu('09:30'), thu('10:00')])}\n\n${waitlistProposal('Corte em quarta-feira, 30/09')}`,
      );
    });

    it('AC 30 (C29): says nothing is free in the 7 days and keeps no offer', async () => {
      const { text, block, joao, draft } = await setup();
      block(joao.id, local(TODAY, '09:00'), local('2026-10-06', '19:00'));

      expect(await text({ services: ['Corte'], barber: 'João' })).toBe(
        `Não encontrei horário livre para Corte até segunda-feira, 05/10.\n\n${waitlistProposal('Corte até segunda-feira, 05/10')}`,
      );
      expect(draft()?.offer).toEqual([]);

      expect(
        await text({ services: ['Corte'], barber: 'João', date: TOMORROW }),
      ).toMatch(
        /Não encontrei horário livre para Corte até terça-feira, 06\/10\.\n\nSe preferir, posso te colocar na lista de espera para Corte até terça-feira, 06\/10 e te aviso se vagar um horário\. Responda "lista de espera" para entrar\.$/,
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

  describe('US-23 add-on suggestion', () => {
    const SUGESTAO =
      'Quer incluir Barba por +R$ 30,00? Responda "sim" para incluir ou "não" para seguir só com Corte.';
    const CORTE_BARBA = 'Horários para Corte + Barba (R$ 75,00, 50 min):';

    // Corte suggests Barba unless the test says otherwise (CA-04.2).
    async function addOnSetup(corteAddOns: string[] = ['barba']) {
      const scenario = await setup();
      const { services, barbers, barbershop } = scenario;
      const addOns = async (serviceId: string, ids: string[]) => {
        const stored = await services.findById(barbershop.id, serviceId);
        const state = describeService(stored!);
        await services.save(
          BarbershopService.restore({
            ...state,
            price: ServicePrice.create(state.priceCents),
            duration: ServiceDuration.create(state.durationMinutes),
            suggestedAddOnIds: ids,
            createdAt: stored!.createdAt,
          }),
        );
      };
      // Lavagem and Sobrancelha, both performed by João only.
      const extras = async () => {
        await seedService(services, {
          id: 'lavagem',
          name: 'Lavagem',
          priceCents: 2000,
          durationMinutes: 20,
        });
        await seedService(services, {
          id: 'sobrancelha',
          name: 'Sobrancelha',
          priceCents: 1500,
          durationMinutes: 10,
        });
        const joao = await barbers.findById(barbershop.id, 'joao');
        joao!.changeServices(
          await services.findByIds(barbershop.id, [
            'corte',
            'barba',
            'lavagem',
            'sobrancelha',
          ]),
        );
        await barbers.save(joao!);
      };
      await addOns('corte', corteAddOns);
      return { ...scenario, addOns, extras };
    }

    it('US-23 CA-23.1 (C1): suggests Barba before searching any slot', async () => {
      const { text, listSlots } = await addOnSetup();
      const search = jest.spyOn(listSlots, 'execute');

      expect(await text(JOAO_AFTERNOON)).toBe(SUGESTAO);
      expect(search).toHaveBeenCalledTimes(0);
    });

    describe('AC 2 (C2): the first suggestible add-on', () => {
      it('US-23 AC 2 (C2) (a): skips an inactive add-on', async () => {
        const { text } = await addOnSetup(['hidratacao', 'barba']);

        expect(await text(JOAO_AFTERNOON)).toBe(SUGESTAO);
      });

      it('US-23 AC 2 (C2) (b): skips an add-on already requested', async () => {
        const { text } = await addOnSetup(['barba']);

        expect(
          await text({ ...JOAO_AFTERNOON, services: ['Corte', 'Barba'] }),
        ).toBe(offer([wed('12:00'), wed('12:30'), wed('13:00')], CORTE_BARBA));
      });

      it('US-23 AC 2 (C2) (c): skips an add-on no barber performs', async () => {
        const { text } = await addOnSetup(['pigmentacao', 'barba']);

        expect(await text(JOAO_AFTERNOON)).toBe(SUGESTAO);
      });

      it('US-23 AC 2 (C2) (d): skips an add-on the named barber does not perform', async () => {
        const { text } = await addOnSetup(['barba']);

        expect(await text({ ...JOAO_AFTERNOON, barber: 'Pedro' })).toBe(
          offer([
            wed('12:00', 'Pedro'),
            wed('12:30', 'Pedro'),
            wed('13:00', 'Pedro'),
          ]),
        );
      });

      it('US-23 AC 2 (C2) (e): without a named barber, one apt barber is enough', async () => {
        const { text } = await addOnSetup(['barba']);

        expect(
          await text({ ...JOAO_AFTERNOON, barber: null, anyBarber: true }),
        ).toBe(SUGESTAO);
      });

      it('US-23 AC 2 (C2) (f): follows the registered order', async () => {
        const { text, extras } = await addOnSetup(['lavagem', 'sobrancelha']);
        await extras();

        expect(await text(JOAO_AFTERNOON)).toBe(
          'Quer incluir Lavagem por +R$ 20,00? Responda "sim" para incluir ou "não" para seguir só com Corte.',
        );
      });

      it('US-23 AC 2 (C2) (g): follows the order of the requested services', async () => {
        const { text, extras, addOns } = await addOnSetup(['lavagem']);
        await extras();
        await addOns('barba', ['sobrancelha']);

        expect(
          await text({ ...JOAO_AFTERNOON, services: ['Barba', 'Corte'] }),
        ).toBe(
          'Quer incluir Sobrancelha por +R$ 15,00? Responda "sim" para incluir ou "não" para seguir só com Barba + Corte.',
        );
      });
    });

    it('US-23 AC 3 (C3): records the pending suggestion with the request', async () => {
      const { text, draft } = await addOnSetup();

      await text(JOAO_AFTERNOON);

      expect(draft()).toMatchObject({
        addOnSuggestion: { serviceId: 'barba', pending: true },
        serviceIds: ['corte'],
        barberId: 'joao',
        date: '2026-09-30',
        period: 'afternoon',
        offer: [],
      });
    });

    it.each([[[]], [['hidratacao']]])(
      'US-23 CA-23.4 (C4): with add-ons %j, offers as in US-17 without suggesting',
      async (addOns) => {
        const { text, draft } = await addOnSetup(addOns);

        expect(await text(JOAO_AFTERNOON)).toBe(
          offer([wed('12:00'), wed('12:30'), wed('13:00')]),
        );
        expect(draft()?.addOnSuggestion).toBeNull();
      },
    );

    describe('AC 5 (C5): suggests once per draft', () => {
      it('US-23 AC 5 (C5) (a): not the add-on of the accepted add-on', async () => {
        const { text, extras, addOns } = await addOnSetup();
        await extras();
        await addOns('barba', ['sobrancelha']);
        await text(JOAO_AFTERNOON);

        expect(
          await text({ bookingRequested: false, addOnAccepted: true }),
        ).toBe(offer([wed('12:00'), wed('12:30'), wed('13:00')], CORTE_BARBA));
      });

      it('US-23 AC 5 (C5) (b): not after declining', async () => {
        const { text } = await addOnSetup();
        await text(JOAO_AFTERNOON);
        await text({});

        expect(await text({ date: '2026-10-01' })).toBe(
          offer([thu('12:00'), thu('12:30'), thu('13:00')]),
        );
      });

      it('US-23 AC 5 (C5) (c): not in the new offer after a taken slot', async () => {
        const { text, busy, joao } = await addOnSetup();
        await text(JOAO_AFTERNOON);
        await text({});
        busy(joao.id, local(TOMORROW, '12:00'), local(TOMORROW, '12:30'));

        expect(await text({ bookingRequested: false, choice: 1 })).toBe(
          `Esse horário acabou de ser ocupado.\n\n${offer([wed('12:30'), wed('13:00'), wed('13:30')])}`,
        );
      });
    });

    it('US-23 AC 6 (C6): does not suggest when rescheduling', async () => {
      const { text, own } = await addOnSetup();
      await own({ id: 'R', startsAt: local(TOMORROW, '15:00') });

      expect(
        await text({ bookingRequested: false, rescheduleRequested: true }),
      ).toBe(offer([tue('13:00'), tue('13:30'), tue('14:00')]));
    });

    it('US-23 AC 7 (C7): hands a blocked client to the team without suggesting', async () => {
      const { send, noShows, draft } = await addOnSetup();
      await noShows(2);

      expect(await send(JOAO_AFTERNOON)).toEqual({
        type: 'handoff',
        reason: 'blocked_client',
      });
      expect(draft()).toBeNull();
    });

    it('US-23 AC 8 (C8): gives the interpreter the pending add-on only', async () => {
      const { text, booking, barbershop, client, clock, services } =
        await addOnSetup();
      const suggested = async () =>
        (
          await booking.prepare(
            barbershop,
            client.id,
            clock.now(),
            await services.listActiveByBarbershop(barbershop.id),
          )
        ).interpreterInput.suggestedAddOn;

      expect(await suggested()).toBeNull();
      await text(JOAO_AFTERNOON);
      expect(await suggested()).toBe('Barba');
      await text({});
      expect(await suggested()).toBeNull();
    });

    it('US-23 CA-23.2 (C9): accepting offers slots of Corte + Barba', async () => {
      const { text, draft } = await addOnSetup();
      await text(JOAO_AFTERNOON);

      expect(await text({ bookingRequested: false, addOnAccepted: true })).toBe(
        offer([wed('12:00'), wed('12:30'), wed('13:00')], CORTE_BARBA),
      );
      expect(draft()).toMatchObject({
        serviceIds: ['corte', 'barba'],
        addOnSuggestion: { serviceId: 'barba', pending: false },
      });
    });

    it('US-23 AC 9 (C10): accepting asks for a barber who performs both', async () => {
      const { text } = await addOnSetup();

      expect(await text({ services: ['Corte'], date: TOMORROW })).toBe(
        SUGESTAO,
      );
      expect(await text({ addOnAccepted: true })).toBe(
        'Tem preferência de barbeiro? Fazem Corte + Barba: João. Se não tiver, responda "tanto faz".',
      );
    });

    it('US-23 AC 10 (C11): naming the add-on accepts it and keeps Corte', async () => {
      const { text, draft } = await addOnSetup();
      await text(JOAO_AFTERNOON);

      expect(await text({ services: ['Barba'] })).toBe(
        offer([wed('12:00'), wed('12:30'), wed('13:00')], CORTE_BARBA),
      );
      expect(draft()?.serviceIds).toEqual(['corte', 'barba']);
    });

    it('US-23 CA-23.2 (C12): searches the engine with both services', async () => {
      const { text, listSlots } = await addOnSetup();
      await text(JOAO_AFTERNOON);
      const search = jest.spyOn(listSlots, 'execute');

      await text({ addOnAccepted: true });

      expect(search.mock.calls.length).toBeGreaterThan(0);
      for (const [query] of search.mock.calls) {
        expect(query.serviceIds).toEqual(['corte', 'barba']);
      }
    });

    it('US-23 CA-23.2 (C13): books both services and sums the price', async () => {
      const { text, bookedBy, client } = await addOnSetup();
      await text(JOAO_AFTERNOON);
      await text({ addOnAccepted: true });

      expect(await text({ bookingRequested: false, choice: 1 })).toBe(
        'Agendamento confirmado!\nServiços: Corte, Barba\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 12:00\nValor: R$ 75,00\nEndereço: Rua das Flores, 123',
      );
      const [appointment] = await bookedBy(client.id);
      expect(appointment.serviceIds).toEqual(['corte', 'barba']);
      expect(appointment.startsAt).toEqual(local(TOMORROW, '12:00'));
      expect(appointment.endsAt).toEqual(local(TOMORROW, '12:50'));
    });

    it('US-23 AC 13 (C14): combines the accepting message with the draft', async () => {
      const { text } = await addOnSetup();
      await text(JOAO_AFTERNOON);

      expect(await text({ addOnAccepted: true, date: '2026-10-01' })).toBe(
        offer([thu('12:00'), thu('12:30'), thu('13:00')], CORTE_BARBA),
      );
    });

    it('US-23 CA-23.3 (C16): declining offers Corte and keeps the services', async () => {
      const { text, draft } = await addOnSetup();
      await text(JOAO_AFTERNOON);

      expect(await text({})).toBe(
        offer([wed('12:00'), wed('12:30'), wed('13:00')]),
      );
      expect(draft()).toMatchObject({
        serviceIds: ['corte'],
        addOnSuggestion: { serviceId: 'barba', pending: false },
      });
    });
  });
});

describe('BookViaWhatsAppUseCase US-24', () => {
  const PROPOSTA_SEMANA =
    'Se preferir, posso te colocar na lista de espera para Corte à tarde até segunda-feira, 05/10 e te aviso se vagar um horário. Responda "lista de espera" para entrar.';
  const PROPOSTA_DIA =
    'Se preferir, posso te colocar na lista de espera para Corte à tarde em quarta-feira, 30/09 e te aviso se vagar um horário. Responda "lista de espera" para entrar.';
  const INSCRITO =
    'Pronto! Você está na lista de espera para Corte à tarde em quarta-feira, 30/09. Se vagar um horário, eu te aviso por aqui.';
  const EXPIRADA =
    'O prazo para aceitar esse horário acabou. Você continua na lista de espera.';
  const RECUSADA = 'Tudo bem, você continua na lista de espera.';
  const ACCEPT = { bookingRequested: false, waitlistAccepted: true };
  const DECLINE = { bookingRequested: false, offerDeclined: true };
  const AFTERNOON_PROPOSAL = {
    startsOn: TOMORROW,
    endsOn: TOMORROW,
    period: 'afternoon' as const,
  };

  // CA-24.1 scenario: João has no afternoon slot on Wednesday 30/09.
  async function afternoonFull() {
    const scenario = await setup();
    scenario.block(
      scenario.joao.id,
      local(TOMORROW, '12:00'),
      local(TOMORROW, '18:00'),
    );
    return scenario;
  }

  // CA-24.2: the job offered João's freed 15:00 slot to Carlos.
  async function offeredToCarlos() {
    const scenario = await withSend(await setupWaitlist());
    await scenario.enlist('carlos');
    await scenario.free();
    await scenario.process.execute();
    const [offer] = scenario.offersOf('carlos');
    return { ...scenario, offer };
  }

  describe('joining the waitlist', () => {
    it('US-24 CA-24.1 (C1): with nothing free in 7 days, proposes the waitlist for the searched days and period', async () => {
      const { text, block, joao, draft } = await setup();
      block(joao.id, local(TODAY, '09:00'), local('2026-10-06', '19:00'));

      expect(
        await text({
          services: ['Corte'],
          barber: 'João',
          period: 'afternoon',
        }),
      ).toBe(
        `Não encontrei horário livre para Corte até segunda-feira, 05/10.\n\n${PROPOSTA_SEMANA}`,
      );
      expect(draft()?.waitlistProposal).toEqual({
        startsOn: TODAY,
        endsOn: '2026-10-05',
        period: 'afternoon',
      });
    });

    it('US-24 CA-24.1, AC 2 (C2) (a): an empty period offers the others and proposes waiting for it', async () => {
      const { text, draft } = await afternoonFull();

      expect(await text(JOAO_AFTERNOON)).toBe(
        `Não há horário livre à tarde em quarta-feira, 30/09.\n\n${offer([wed('09:00'), wed('09:30'), wed('10:00')])}\n\n${PROPOSTA_DIA}`,
      );
      expect(draft()?.waitlistProposal).toEqual(AFTERNOON_PROPOSAL);
    });

    it('US-24 AC 2 (C2) (b): a taken time proposes waiting for its period', async () => {
      const { text, draft } = await afternoonFull();

      const reply = await text({
        ...JOAO_AFTERNOON,
        period: null,
        time: '15:00',
      });

      expect(reply.endsWith(`\n\n${PROPOSTA_DIA}`)).toBe(true);
      expect(draft()?.waitlistProposal).toEqual(AFTERNOON_PROPOSAL);
    });

    it('US-24 AC 2 (C2) (c): an empty date without a period proposes waiting for the whole day', async () => {
      const { text, block, joao, draft } = await setup();
      block(joao.id, local(TOMORROW, '09:00'), local(TOMORROW, '19:00'));

      const reply = await text({
        services: ['Corte'],
        barber: 'João',
        date: TOMORROW,
      });

      expect(
        reply.endsWith(
          '\n\nSe preferir, posso te colocar na lista de espera para Corte em quarta-feira, 30/09 e te aviso se vagar um horário. Responda "lista de espera" para entrar.',
        ),
      ).toBe(true);
      expect(draft()?.waitlistProposal).toEqual({
        startsOn: TOMORROW,
        endsOn: TOMORROW,
        period: null,
      });
    });

    it('US-24 AC 3 (C3) (a) (b) (c): gives the interpreter the proposal as the client read it, and null otherwise', async () => {
      const { text, prepare } = await afternoonFull();
      expect((await prepare()).interpreterInput).toMatchObject({
        waitlistProposal: null,
        waitlistOffer: false,
      });

      await text(JOAO_AFTERNOON);
      expect((await prepare()).interpreterInput.waitlistProposal).toBe(
        'Corte à tarde em quarta-feira, 30/09',
      );

      await text({ date: '2026-10-01' });
      expect((await prepare()).interpreterInput).toMatchObject({
        waitlistProposal: null,
        waitlistOffer: false,
      });
    });

    it('US-24 AC 3 (C3) (d): tells the interpreter the offer in force came from the waitlist', async () => {
      const { prepare } = await offeredToCarlos();

      expect((await prepare()).interpreterInput).toMatchObject({
        waitlistProposal: null,
        waitlistOffer: true,
        offeredOptions: ['quarta-feira, 30/09, às 15:00, com João'],
      });
    });

    it('US-24 CA-24.1, AC 4 (C4): accepting stores the entry, clears the draft and confirms', async () => {
      const { text, draft, waitlist, clock } = await afternoonFull();
      await text(JOAO_AFTERNOON);

      expect(await text(ACCEPT)).toBe(INSCRITO);
      expect(
        waitlist.entries.map((entry) => ({
          clientId: entry.clientId,
          serviceIds: entry.serviceIds,
          barberId: entry.barberId,
          startsOn: entry.startsOn,
          endsOn: entry.endsOn,
          period: entry.period,
          createdAt: entry.createdAt,
        })),
      ).toEqual([
        {
          clientId: 'carlos',
          serviceIds: ['corte'],
          barberId: 'joao',
          ...AFTERNOON_PROPOSAL,
          createdAt: clock.now(),
        },
      ]);
      expect(draft()).toBeNull();
    });

    it('US-24 AC 4 (C4): "tanto faz" joins for any barber', async () => {
      const { text, waitlist, block, joao, pedro } = await setup();
      block(joao.id, local(TOMORROW, '12:00'), local(TOMORROW, '18:00'));
      block(pedro.id, local(TOMORROW, '12:00'), local(TOMORROW, '18:00'));
      await text({ ...JOAO_AFTERNOON, barber: null, anyBarber: true });

      expect(await text(ACCEPT)).toBe(INSCRITO);
      expect(waitlist.entries.map((entry) => entry.barberId)).toEqual([null]);
    });

    it('US-24 AC 5 (C5): joining again replaces the entry, with the new instant', async () => {
      const { text, waitlist, clock, block, joao } = await afternoonFull();
      await text(JOAO_AFTERNOON);
      await text(ACCEPT);

      clock.current = new Date(clock.now().getTime() + 10 * 60 * 1000);
      block(joao.id, local(TOMORROW, '09:00'), local(TOMORROW, '12:00'));
      await text({ ...JOAO_AFTERNOON, period: 'morning' });
      await text(ACCEPT);

      expect(
        waitlist.entries.map((entry) => [
          entry.clientId,
          entry.period,
          entry.createdAt,
        ]),
      ).toEqual([['carlos', 'morning', clock.now()]]);
    });

    it('US-24 AC 6 (C6): accepting without a proposal stores nothing and answers as US-17', async () => {
      const { text, waitlist } = await setup();
      expect(await text(ACCEPT)).toBe(
        'Qual serviço você quer agendar? Temos: Barba, Corte, Pigmentação.',
      );

      const shown = await text(JOAO_AFTERNOON);
      expect(await text(ACCEPT)).toBe(shown);
      expect(waitlist.entries).toEqual([]);
    });

    it('US-24 AC 7 (C7): rescheduling with nothing free does not propose the waitlist', async () => {
      const { text, block, joao, own, draft } = await setup();
      await own({ id: 'mine', startsAt: local(TOMORROW, '15:00') });
      block(joao.id, local(TODAY, '09:00'), local('2026-10-06', '19:00'));

      expect(await text({ rescheduleRequested: true })).toBe(
        'Não encontrei horário livre para Corte até segunda-feira, 05/10.',
      );
      expect(draft()?.waitlistProposal).toBeNull();
    });
  });

  describe('accepting the offer', () => {
    it('US-24 CA-24.3 (C18): within the deadline books the slot, accepts the offer and leaves the queue', async () => {
      const { text, waitlist, bookedBy, waitlistMetrics } =
        await offeredToCarlos();

      expect(await text({ choice: 1 })).toBe(
        'Agendamento confirmado!\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 15:00\nValor: R$ 45,00\nEndereço: Rua das Flores, 123',
      );
      const booked = (await bookedBy('carlos')).filter(
        (appointment) => appointment.status === 'confirmed',
      );
      expect(
        booked.map((appointment) => [
          appointment.barberId,
          appointment.startsAt,
          appointment.origin,
          appointment.serviceIds,
        ]),
      ).toEqual([['joao', FREED_AT, 'bot', ['corte']]]);
      expect(waitlistMetrics.offers).toContain('accepted');
      expect(waitlist.entries).toEqual([]);
      expect(waitlist.offers).toEqual([]);
    });

    it.each([
      ['(a) at the deadline', 'deadline'],
      ['(b) already declined', 'declined'],
      ['(c) already expired', 'expired'],
    ] as const)(
      'US-24 AC 19 (C19) %s: does not book, keeps the entry and says the offer is over',
      async (_, state) => {
        const { text, offer, waitlist, bookedBy, clock, draft } =
          await offeredToCarlos();
        const stored = waitlist.offers.find(({ id }) => id === offer.id);
        if (state === 'deadline') clock.current = offer.expiresAt;
        if (state !== 'deadline' && stored) stored.status = state;

        expect(await text({ choice: 1 })).toBe(EXPIRADA);
        expect(
          (await bookedBy('carlos')).filter(
            (appointment) => appointment.status === 'confirmed',
          ),
        ).toEqual([]);
        expect(draft()).toBeNull();
        expect(waitlist.entries.map((entry) => entry.clientId)).toEqual([
          'carlos',
        ]);
      },
    );

    it('US-24 AC 20 (C20): a slot taken before the answer searches again, keeps the entry and is never offered again', async () => {
      const { text, own, waitlist, process, offersOf, appointments } =
        await offeredToCarlos();
      await own({ id: 'occupant', startsAt: FREED_AT, clientId: 'bruno' });

      const reply = await text({ choice: 1 });

      expect(
        reply.startsWith(
          `Esse horário acabou de ser ocupado.\n\n${CORTE}\n1. quarta-feira, 30/09, às 12:00`,
        ),
      ).toBe(true);
      expect(waitlist.entries.map((entry) => entry.clientId)).toEqual([
        'carlos',
      ]);

      const occupant = await appointments.findById('barbershop-a', 'occupant');
      if (!occupant) throw new Error('occupant not stored');
      await appointments.saveStatus(occupant.cancel());
      await process.execute();
      expect(
        offersOf('carlos').filter((offer) => offer.appointmentId === 'freed'),
      ).toHaveLength(1);
    });
  });

  describe('declining the offer', () => {
    it('US-24 CA-24.4 (C21): declines the offer, clears the draft, keeps the entry and says so', async () => {
      const { text, offer, waitlist, draft } = await offeredToCarlos();

      expect(await text(DECLINE)).toBe(RECUSADA);
      expect(waitlist.offers.find(({ id }) => id === offer.id)?.status).toBe(
        'declined',
      );
      expect(draft()).toBeNull();
      expect(waitlist.entries.map((entry) => entry.clientId)).toEqual([
        'carlos',
      ]);
    });
  });

  describe('metrics', () => {
    it('US-24 AC 26 (C26): counts joined, and accepted and booked from the offer', async () => {
      const joining = await afternoonFull();
      await joining.text(JOAO_AFTERNOON);
      await joining.text(ACCEPT);
      expect(joining.waitlistMetrics.entries).toEqual(['joined']);

      const accepting = await offeredToCarlos();
      await accepting.text({ choice: 1 });
      expect(accepting.waitlistMetrics.offers).toEqual(['sent', 'accepted']);
      expect(accepting.waitlistMetrics.entries).toEqual(['booked']);
    });

    it('US-24 AC 26 (C26): counts declined', async () => {
      const { text, waitlistMetrics } = await offeredToCarlos();
      await text(DECLINE);
      expect(waitlistMetrics.offers).toEqual(['sent', 'declined']);
    });
  });
});

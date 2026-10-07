import { Appointment } from '../../domain/entities/appointment';
import { local, TOMORROW } from '../testing/whatsapp-booking-fixtures';
import {
  ANA_PHONE,
  BRUNO_PHONE,
  FREED_AT,
  setupWaitlist,
} from '../testing/waitlist-fixtures';

const TODAY = '2026-09-29';
const MINUTE_MS = 60 * 1000;
const OFERTA =
  'Vagou um horário: Corte, quarta-feira, 30/09, às 15:00, com João (R$ 45,00, 30 min). Responda "sim" em até 15 min para agendar ou "não" para recusar.';

const minutesAfter = (instant: Date, minutes: number): Date =>
  new Date(instant.getTime() + minutes * MINUTE_MS);

async function setup() {
  const scenario = await setupWaitlist();
  const { appointments, barbershop, waitlist, listSlots } = scenario;
  // RN-11: no-shows are counted from past appointments of the client.
  const noShows = async (clientId: string, count: number): Promise<void> => {
    for (let index = 0; index < count; index += 1) {
      const startsAt = local(`2026-09-0${index + 1}`, '10:00');
      await appointments.create(
        Appointment.restore({
          id: `no-show-${clientId}-${index + 1}`,
          barbershopId: barbershop.id,
          barberId: 'pedro',
          clientId,
          serviceIds: ['corte'],
          startsAt,
          endsAt: minutesAfter(startsAt, 30),
          status: 'no_show',
          origin: 'manual',
          createdAt: startsAt,
        }),
      );
    }
  };
  const pending = () =>
    waitlist.offers.filter((offer) => offer.status === 'pending');
  const joaoFreeAt = async (startsAt: Date): Promise<boolean> =>
    (
      await listSlots.execute({
        barbershopId: barbershop.id,
        barberId: 'joao',
        serviceIds: ['corte'],
        date: TOMORROW,
        origin: 'bot',
      })
    ).some((slot) => slot.startsAt.getTime() === startsAt.getTime());
  return { ...scenario, noShows, pending, joaoFreeAt };
}

describe('ProcessWaitlistUseCase', () => {
  describe('US-24 offer to the first compatible entry', () => {
    it('US-24 CA-24.2, RN-15, RN-16 (C9): offers the freed slot only to the entry that joined first, for 15 min', async () => {
      const { process, enlist, free, waitlist, clock } = await setup();
      await enlist('ana');
      await enlist('bruno');
      await free();

      await process.execute();

      expect(waitlist.offers).toEqual([
        {
          id: expect.any(String) as string,
          barbershopId: 'barbershop-a',
          entryId: 'entry-ana',
          appointmentId: 'freed',
          barberId: 'joao',
          startsAt: FREED_AT,
          expiresAt: minutesAfter(clock.now(), 15),
          status: 'pending',
        },
      ]);
    });

    it('US-24 RN-16 (C9): the deadline follows waitlistOfferMinutes of the barbershop', async () => {
      const { process, enlist, free, waitlist, clock, offerMinutes } =
        await setup();
      offerMinutes(30);
      await enlist('ana');
      await free();

      await process.execute();

      expect(waitlist.offers.map((offer) => offer.expiresAt)).toEqual([
        minutesAfter(clock.now(), 30),
      ]);
    });

    it.each([
      [
        'a confirmed appointment',
        'confirmed' as const,
        FREED_AT,
        'barbershop-a',
      ],
      [
        'a cancelled appointment that already started',
        'cancelled' as const,
        local(TODAY, '11:00'),
        'barbershop-a',
      ],
      [
        'a cancelled appointment of another barbershop',
        'cancelled' as const,
        FREED_AT,
        'barbershop-b',
      ],
    ])(
      'US-24 AC 9 (C9): %s is not a freed slot',
      async (_, status, startsAt, barbershopId) => {
        const { process, enlist, own, waitlist, connector } = await setup();
        await enlist('ana', {
          startsOn: TODAY,
          endsOn: TOMORROW,
          period: null,
        });
        await own({
          id: 'other',
          startsAt,
          status,
          barbershopId,
          barberId: barbershopId === 'barbershop-b' ? 'marcos' : 'joao',
        });

        await process.execute();

        expect(waitlist.offers).toEqual([]);
        expect(connector.sentTexts).toEqual([]);
      },
    );
  });

  describe('US-24 compatibility (AC 10)', () => {
    it.each([
      ['(a) another barber', { barberId: 'pedro' }, false],
      ['(b) any barber', { barberId: null }, true],
      [
        '(c) dates outside the window',
        { startsOn: '2026-10-01', endsOn: '2026-10-01' },
        false,
      ],
      ['(d) another period', { period: 'morning' as const }, false],
      ['(e) no period', { period: null }, true],
    ])('US-24 AC 10 (C10) %s', async (_, overrides, offered) => {
      const { process, enlist, free, offersOf } = await setup();
      await enlist('ana', overrides);
      await free();

      await process.execute();

      expect(offersOf('ana')).toHaveLength(offered ? 1 : 0);
    });

    it('US-24 AC 10 (C10) (f): services that do not fit before the next appointment', async () => {
      const { process, enlist, free, offersOf, busy } = await setup();
      await enlist('ana', { serviceIds: ['corte', 'barba'] });
      await free();
      busy('joao', local(TOMORROW, '15:30'), local(TOMORROW, '16:00'));

      await process.execute();

      expect(offersOf('ana')).toEqual([]);
    });

    it('US-24 AC 10 (C10) (g): an inactive service skips the entry without failing the run', async () => {
      const { process, enlist, free, offersOf, waitlist } = await setup();
      await enlist('ana', { serviceIds: ['hidratacao'] });
      await free();

      const result = await process.execute();

      expect(offersOf('ana')).toEqual([]);
      expect(result.failures).toEqual([]);
      expect(waitlist.entries.map((entry) => entry.id)).toEqual(['entry-ana']);
    });
  });

  describe('US-24 the offer', () => {
    it('US-24 AC 11 (C11): puts the offer in the draft of the entry and sends the offer text once', async () => {
      const { process, enlist, free, conversations, connector, waitlist } =
        await setup();
      await enlist('ana');
      await free();

      await process.execute();

      const draft = conversations.row('barbershop-a', 'ana')?.bookingDraft;
      expect(draft).toMatchObject({
        action: 'book',
        candidates: [],
        targetAppointmentId: null,
        serviceIds: ['corte'],
        barberId: null,
        anyBarber: true,
        date: '2026-09-30',
        period: 'afternoon',
        time: null,
        offer: [{ barberId: 'joao', startsAt: FREED_AT }],
        waitlistProposal: null,
        waitlistOfferId: waitlist.offers[0].id,
      });
      expect(connector.sentTexts).toEqual([
        { barbershopId: 'barbershop-a', phone: ANA_PHONE, text: OFERTA },
      ]);
    });

    it('US-24 CA-24.5 (C12): a slot freed within the minimum advance is offered to nobody', async () => {
      const { process, enlist, free, waitlist, connector } = await setup();
      await enlist('ana', { startsOn: TODAY, endsOn: TODAY });
      await enlist('bruno', { startsOn: TODAY, endsOn: TODAY });
      await free('freed', local(TODAY, '12:30'));

      await process.execute();

      expect(waitlist.offers).toEqual([]);
      expect(connector.sentTexts).toEqual([]);
    });

    it('US-24 AC 13 (C13) (a): skips a client blocked by no-shows', async () => {
      const { process, enlist, free, offersOf, noShows } = await setup();
      await enlist('ana');
      await enlist('bruno');
      await noShows('ana', 2);
      await free();

      await process.execute();

      expect(offersOf('ana')).toEqual([]);
      expect(offersOf('bruno')).toHaveLength(1);
    });

    it('US-24 AC 13 (C13) (b) (c): skips a paused conversation, and the slot stays with the pending offer', async () => {
      const { process, enlist, free, offersOf, conversations, clock } =
        await setup();
      await enlist('ana');
      await enlist('bruno');
      await conversations.pause(
        'barbershop-a',
        'ana',
        'requested',
        clock.now(),
      );
      await free();

      await process.execute();
      expect(offersOf('ana')).toEqual([]);
      expect(offersOf('bruno')).toHaveLength(1);

      await conversations.resume('barbershop-a', 'ana');
      await process.execute();
      expect(offersOf('ana')).toEqual([]);
    });

    it('US-24 AC 15 (C15): sends nothing while the WhatsApp is disconnected', async () => {
      const { process, enlist, free, waitlist, connector, connect } =
        await setup();
      await connect('disconnected');
      await enlist('ana');
      await free();

      await process.execute();

      expect(waitlist.offers).toEqual([]);
      expect(connector.sentTexts).toEqual([]);
    });

    it('US-24 AC 15 (C15): sends nothing while the barbershop is suspended', async () => {
      const { process, enlist, free, waitlist, connector, suspend } =
        await setup();
      suspend();
      await enlist('ana');
      await free();

      await process.execute();

      expect(waitlist.offers).toEqual([]);
      expect(connector.sentTexts).toEqual([]);
    });

    it('US-24 AC 16 (C16): a failed send keeps the offer pending and is never resent', async () => {
      const { process, enlist, free, waitlist, connector, clock } =
        await setup();
      await enlist('ana');
      await free();
      connector.failing.add('sendText');

      const result = await process.execute();
      const [offer] = waitlist.offers;

      expect(offer).toMatchObject({
        status: 'pending',
        expiresAt: minutesAfter(clock.now(), 15),
      });
      expect(result.sendFailures).toEqual([
        {
          barbershopId: 'barbershop-a',
          offerId: offer.id,
          error: expect.any(Error) as Error,
        },
      ]);

      connector.failing.delete('sendText');
      clock.current = minutesAfter(clock.now(), 5);
      await process.execute();
      expect(connector.sentTexts).toEqual([]);
      expect(waitlist.offers).toHaveLength(1);
    });

    it('US-24 AC 17 (C17): a failing barbershop is reported and the next one still gets its offers', async () => {
      const { process, enlist, free, connector, addFailingBarbershop } =
        await setup();
      addFailingBarbershop();
      await enlist('ana');
      await free();

      const result = await process.execute();

      expect(result.failures.map((failure) => failure.barbershopId)).toEqual([
        'barbershop-0',
      ]);
      expect(connector.sentTexts.map((sent) => sent.phone)).toEqual([
        ANA_PHONE,
      ]);
    });
  });

  describe('US-24 declined or expired offers pass on', () => {
    it('US-24 CA-24.4 (C22): at the deadline the offer expires and goes to the next entry in the same run', async () => {
      const { process, enlist, free, offersOf, clock, connector } =
        await setup();
      await enlist('ana');
      await enlist('bruno');
      await free();
      await process.execute();
      const [anaOffer] = offersOf('ana');

      clock.current = minutesAfter(anaOffer.expiresAt, -1);
      await process.execute();
      expect(offersOf('ana').map((offer) => offer.status)).toEqual(['pending']);
      expect(offersOf('bruno')).toEqual([]);

      clock.current = anaOffer.expiresAt;
      await process.execute();
      expect(offersOf('ana').map((offer) => offer.status)).toEqual(['expired']);
      expect(offersOf('bruno').map((offer) => offer.status)).toEqual([
        'pending',
      ]);
      expect(connector.sentTexts.map((sent) => sent.phone)).toEqual([
        ANA_PHONE,
        BRUNO_PHONE,
      ]);
    });

    it('US-24 CA-24.4, AC 23, AC 24 (C23): a declined slot goes to the next entry, never back, and stays free when the queue ends', async () => {
      const {
        process,
        enlist,
        free,
        offersOf,
        clock,
        waitlist,
        pending,
        joaoFreeAt,
      } = await setup();
      await enlist('ana');
      await enlist('bruno');
      await free();
      await process.execute();
      const [anaOffer] = offersOf('ana');
      await waitlist.resolveOffer(
        'barbershop-a',
        anaOffer.id,
        'declined',
        clock.now(),
      );

      await process.execute();
      expect(offersOf('ana')).toHaveLength(1);
      expect(offersOf('bruno').map((offer) => offer.status)).toEqual([
        'pending',
      ]);

      clock.current = offersOf('bruno')[0].expiresAt;
      await process.execute();
      expect(pending()).toEqual([]);
      expect(waitlist.offers).toHaveLength(2);
      await expect(joaoFreeAt(FREED_AT)).resolves.toBe(true);
    });

    it('US-24 AC 24 (C24): with no compatible entry nothing is offered and the slot stays free', async () => {
      const { process, enlist, free, waitlist, connector, joaoFreeAt } =
        await setup();
      await enlist('ana', { barberId: 'pedro' });
      await free();

      await process.execute();

      expect(waitlist.offers).toEqual([]);
      expect(connector.sentTexts).toEqual([]);
      await expect(joaoFreeAt(FREED_AT)).resolves.toBe(true);
    });
  });

  describe('US-24 entries whose period ended (CA-24.6)', () => {
    it.each([
      ['morning' as const, TODAY, local(TODAY, '11:59'), local(TODAY, '12:00')],
      [
        'afternoon' as const,
        TODAY,
        local(TODAY, '17:59'),
        local(TODAY, '18:00'),
      ],
      [
        'evening' as const,
        TODAY,
        local(TODAY, '23:59'),
        local(TOMORROW, '00:00'),
      ],
      [null, TODAY, local(TODAY, '23:59'), local(TOMORROW, '00:00')],
      [
        'afternoon' as const,
        TOMORROW,
        local(TODAY, '18:00'),
        local(TOMORROW, '18:00'),
      ],
    ])(
      'US-24 CA-24.6, RN-17 (C25): a %s entry ending %s stays until its end and leaves at it',
      async (period, endsOn, before, at) => {
        const { process, enlist, waitlist, clock } = await setup();
        await enlist('ana', { startsOn: TODAY, endsOn, period });

        clock.current = before;
        await process.execute();
        expect(waitlist.entries.map((entry) => entry.id)).toEqual([
          'entry-ana',
        ]);

        clock.current = at;
        const result = await process.execute();
        expect(waitlist.entries).toEqual([]);
        expect(result.removedEntries).toBe(1);
      },
    );

    it('US-24 CA-24.6 (C25): removes ended entries and their offers also while disconnected or suspended', async () => {
      const { process, enlist, free, waitlist, clock, connect, suspend } =
        await setup();
      await enlist('ana', { startsOn: TOMORROW, endsOn: TOMORROW });
      await enlist('bruno', { startsOn: TODAY, endsOn: TODAY });
      await free();
      await process.execute();
      expect(waitlist.offers).toHaveLength(1);

      await connect('disconnected');
      suspend();
      clock.current = local(TOMORROW, '18:00');
      await process.execute();

      expect(waitlist.entries).toEqual([]);
      expect(waitlist.offers).toEqual([]);
    });
  });

  describe('US-24 metrics (AC 26)', () => {
    it('US-24 AC 26 (C26): counts sent, send_failed and expired offers and expired entries', async () => {
      const {
        process,
        enlist,
        free,
        waitlistMetrics,
        connector,
        clock,
        offersOf,
      } = await setup();
      await enlist('ana');
      await enlist('bruno');
      await free();
      await process.execute();
      expect(waitlistMetrics.offers).toEqual(['sent']);

      connector.failing.add('sendText');
      clock.current = offersOf('ana')[0].expiresAt;
      await process.execute();
      expect(waitlistMetrics.offers).toEqual([
        'sent',
        'expired',
        'send_failed',
      ]);

      clock.current = local(TOMORROW, '18:00');
      await process.execute();
      expect(waitlistMetrics.entries).toEqual(['expired', 'expired']);
    });
  });
});

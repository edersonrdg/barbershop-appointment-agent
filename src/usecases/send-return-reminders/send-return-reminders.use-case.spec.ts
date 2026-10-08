import { Appointment } from '../../domain/entities/appointment';
import { AppointmentStatus } from '../../domain/entities/appointment';
import {
  ANA_PHONE,
  BRUNO_PHONE,
  setupReturnReminders,
} from '../testing/return-reminder-fixtures';
import { BOOKING_NOW, local } from '../testing/whatsapp-booking-fixtures';

const PERGUNTA =
  'Obrigado pela visita à Barbearia do Zé! Quer que eu te avise quando estiver na hora de voltar? Responda "sim" e eu te mando um lembrete daqui a 30 dias. Se não quiser, é só ignorar.';
const DESATIVADO =
  'Pronto, você não vai mais receber lembretes de retorno. Se mudar de ideia, é só responder "quero lembrete".';
const convite = (name: string, days: number): string =>
  `Oi, ${name}! Já faz ${days} dias do seu último atendimento na Barbearia do Zé. Que tal agendar o próximo? É só me dizer o dia e o horário. Para não receber mais este lembrete, responda "parar lembretes".`;
const CONVITE_ANA_30 = convite('Ana', 30);
const MINUTE_MS = 60 * 1000;
const TODAY = '2026-09-29';
/** Ends at 12:00 of 30/08, so the 30 days are due at 12:00 of 29/09. */
const LAST_VISIT = local('2026-08-30', '11:30');

const minutesBefore = (minutes: number): Date =>
  new Date(BOOKING_NOW.getTime() - minutes * MINUTE_MS);

describe('SendReturnRemindersUseCase', () => {
  describe('the question after an attendance (US-25 S1)', () => {
    it('US-25 CA-25.1 (C1): asks Ana once, records when, and keeps the reminder off', async () => {
      const { send, attend, textsTo, connector, clientOf } =
        await setupReturnReminders();
      await attend('ana', local(TODAY, '10:00'));

      await send.execute();

      expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA]);
      expect(connector.sentTexts).toHaveLength(1);
      const ana = await clientOf('ana');
      expect(ana.returnReminderAskedAt).toEqual(BOOKING_NOW);
      expect(ana.returnReminderEnabled).toBe(false);
    });

    it('US-25 CA-25.1 (C2) (a): asks when the attendance ended 23h59 ago', async () => {
      const { send, attend, textsTo } = await setupReturnReminders();
      await attend('ana', minutesBefore(23 * 60 + 59 + 30));

      await send.execute();

      expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA]);
    });

    it('US-25 CA-25.1 (C2) (b): does not ask when the attendance ended exactly 24h ago', async () => {
      const { send, attend, connector } = await setupReturnReminders();
      await attend('ana', minutesBefore(24 * 60 + 30));

      await send.execute();

      expect(connector.sentTexts).toEqual([]);
    });

    it('US-25 CA-25.1 (C2) (c): waits for the end of an appointment marked attended early', async () => {
      const { send, attend, textsTo, at } = await setupReturnReminders();
      await attend('ana', local(TODAY, '12:00'));

      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([]);

      at(TODAY, '12:30');
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA]);
    });

    it.each<AppointmentStatus>(['confirmed', 'no_show', 'cancelled'])(
      'US-25 CA-25.1 (C2) (d): does not ask after a %s appointment',
      async (status) => {
        const { send, attend, connector } = await setupReturnReminders();
        await attend('ana', local(TODAY, '10:30'), { status });

        await send.execute();

        expect(connector.sentTexts).toEqual([]);
      },
    );

    it('US-25 CA-25.1 (C2) (e): an attended appointment without a client neither fails nor sends', async () => {
      const { send, appointments, barbershop, connector } =
        await setupReturnReminders();
      const startsAt = local(TODAY, '10:00');
      await appointments.create(
        Appointment.restore({
          id: 'walk-in',
          barbershopId: barbershop.id,
          barberId: 'joao',
          clientId: null,
          serviceIds: ['corte'],
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * MINUTE_MS),
          status: 'attended',
          origin: 'manual',
          createdAt: startsAt,
        }),
      );

      const result = await send.execute();

      expect(result.failures).toEqual([]);
      expect(connector.sentTexts).toEqual([]);
    });

    it('US-25 CA-25.1 (C2) (f): an attendance of barbershop B sends nothing in barbershop A', async () => {
      const { send, attend, connector } = await setupReturnReminders();
      await attend('ana', local(TODAY, '10:00'), {
        barbershopId: 'barbershop-b',
      });

      await send.execute();

      expect(connector.sentTexts).toEqual([]);
    });

    it('US-25 CA-25.1 (C3) (a): does not ask a client with the reminder on', async () => {
      const { send, attend, clients, barbershop, connector } =
        await setupReturnReminders();
      clients.setReturnReminder(barbershop.id, 'ana', { enabled: true });
      await attend('ana', local(TODAY, '10:00'));

      await send.execute();

      expect(connector.sentTexts).toEqual([]);
    });

    it('US-25 CA-25.1 (C3) (b): does not ask a client asked before', async () => {
      const { send, attend, clients, barbershop, connector } =
        await setupReturnReminders();
      clients.setReturnReminder(barbershop.id, 'ana', {
        askedAt: local('2026-09-01', '12:00'),
      });
      await attend('ana', local(TODAY, '10:00'));

      await send.execute();

      expect(connector.sentTexts).toEqual([]);
    });

    it('US-25 CA-25.1 (C3) (c): does not ask a client with a recorded opt-in change', async () => {
      const { send, attend, clients, barbershop, connector, clientOf } =
        await setupReturnReminders();
      const change = {
        barbershopId: barbershop.id,
        clientId: 'ana',
        channel: 'whatsapp' as const,
        recordedAt: minutesBefore(120),
      };
      await clients.changeReturnReminder({
        ...change,
        id: 'change-1',
        enabled: true,
      });
      await clients.changeReturnReminder({
        ...change,
        id: 'change-2',
        enabled: false,
      });
      const ana = await clientOf('ana');
      expect(ana.returnReminderEnabled).toBe(false);
      expect(ana.returnReminderAskedAt).toBeNull();
      await attend('ana', local(TODAY, '10:00'));

      await send.execute();

      expect(connector.sentTexts).toEqual([]);
    });

    it('US-25 (C4): asks once for two attendances, and never again', async () => {
      const { send, attend, textsTo } = await setupReturnReminders();
      await attend('ana', local(TODAY, '09:00'));
      await attend('ana', local(TODAY, '10:00'));

      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA]);

      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA]);
    });

    it('US-25 (C5): skips a paused conversation without claiming, and asks once it is resumed', async () => {
      const { send, attend, textsTo, pause, resume, clientOf } =
        await setupReturnReminders();
      await attend('ana', local(TODAY, '10:00'));
      await pause('ana');

      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([]);
      expect((await clientOf('ana')).returnReminderAskedAt).toBeNull();

      await resume('ana');
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA]);
    });

    it('US-25 (C6): neither claims nor asks while disconnected or suspended', async () => {
      const { send, attend, textsTo, connect, suspend, unsuspend, clientOf } =
        await setupReturnReminders();
      await attend('ana', local(TODAY, '10:00'));

      await connect('disconnected');
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([]);
      expect((await clientOf('ana')).returnReminderAskedAt).toBeNull();

      await connect('connected');
      suspend();
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([]);
      expect((await clientOf('ana')).returnReminderAskedAt).toBeNull();

      unsuspend();
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA]);
    });

    it('US-25 (C7): keeps the claim of a question whose send failed and never resends it', async () => {
      const { send, attend, connector, clientOf, barbershop } =
        await setupReturnReminders();
      await attend('ana', local(TODAY, '10:00'));
      connector.failing.add('sendText');

      const result = await send.execute();

      expect((await clientOf('ana')).returnReminderAskedAt).toEqual(
        BOOKING_NOW,
      );
      expect(result.sendFailures).toEqual([
        {
          barbershopId: barbershop.id,
          clientId: 'ana',
          kind: 'question',
          error: expect.any(Error) as Error,
        },
      ]);

      connector.failing.clear();
      await send.execute();
      expect(connector.sentTexts).toEqual([]);
    });
  });

  describe('the invite to come back (US-25 S3)', () => {
    async function withAnaOptedIn() {
      const scenario = await setupReturnReminders();
      scenario.clients.setReturnReminder(scenario.barbershop.id, 'ana', {
        enabled: true,
      });
      return scenario;
    }

    it('US-25 CA-25.3 (C10) (c): sends no invite right after Ana turns the reminder off', async () => {
      const { send, attend, say, textsTo } = await withAnaOptedIn();
      await attend('ana', LAST_VISIT);

      await say(ANA_PHONE, { returnReminder: 'disable' });
      await send.execute();

      expect(textsTo(ANA_PHONE)).toEqual([DESATIVADO]);
    });

    it('US-25 CA-25.2 (C13): invites at the due time, once', async () => {
      const { send, attend, textsTo, at } = await withAnaOptedIn();
      await attend('ana', LAST_VISIT);

      at(TODAY, '11:59');
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([]);

      at(TODAY, '12:00');
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([CONVITE_ANA_30]);

      at(TODAY, '12:01');
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([CONVITE_ANA_30]);
    });

    it('US-25 CA-25.2 (C13): counts the days since the last attendance in the invite', async () => {
      const { send, attend, textsTo } = await withAnaOptedIn();
      await attend('ana', local('2026-08-15', '11:30'));

      await send.execute();

      expect(textsTo(ANA_PHONE)).toEqual([convite('Ana', 45)]);
    });

    it('US-25 (C14) (a): no invite while an appointment is booked, and one once it is cancelled', async () => {
      const { send, attend, textsTo, appointments, barbershop } =
        await withAnaOptedIn();
      await attend('ana', LAST_VISIT);
      const booked = await attend('ana', local('2026-09-30', '15:00'), {
        status: 'confirmed',
      });

      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([]);

      const stored = await appointments.findById(barbershop.id, booked);
      await appointments.saveStatus((stored as Appointment).cancel());
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([CONVITE_ANA_30]);
    });

    it('US-25 CA-25.4 (C14) (b): no invite for Bruno with the reminder off', async () => {
      const { send, attend, textsTo } = await setupReturnReminders();
      await attend('bruno', LAST_VISIT);

      await send.execute();

      expect(textsTo(BRUNO_PHONE)).toEqual([]);
    });

    it('US-25 (C14) (c): no invite while the latest attendance is not due', async () => {
      const { send, attend, connector } = await withAnaOptedIn();
      await attend('ana', LAST_VISIT);
      await attend('ana', local('2026-09-19', '10:00'));

      await send.execute();

      expect(connector.sentTexts).toEqual([]);
    });

    it('US-25 (C14) (d): a later no-show does not move the last attendance', async () => {
      const { send, attend, textsTo } = await withAnaOptedIn();
      await attend('ana', LAST_VISIT);
      await attend('ana', local('2026-09-25', '10:00'), { status: 'no_show' });

      await send.execute();

      expect(textsTo(ANA_PHONE)).toEqual([CONVITE_ANA_30]);
    });

    it('US-25 (C14) (e): follows returnReminderDays 45', async () => {
      const { send, attend, connector, setDays } = await withAnaOptedIn();
      setDays(45);
      await attend('ana', LAST_VISIT);

      await send.execute();

      expect(connector.sentTexts).toEqual([]);
    });

    it('US-25 (C15): one invite per attendance; the next one is due 30 days after the new attendance', async () => {
      const { send, attend, textsTo, at } = await withAnaOptedIn();
      await attend('ana', LAST_VISIT);
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([CONVITE_ANA_30]);

      await attend('ana', local(TODAY, '10:00'));
      at('2026-10-29', '10:29');
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([CONVITE_ANA_30]);

      at('2026-10-29', '10:30');
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([CONVITE_ANA_30, CONVITE_ANA_30]);
    });

    it('US-25 (C16) (a): skips a client blocked by no-shows, and invites once the no-shows are reset', async () => {
      const { send, attend, textsTo, ledger, barbershop } =
        await withAnaOptedIn();
      await attend('ana', LAST_VISIT);
      await attend('ana', local('2026-09-01', '10:00'), { status: 'no_show' });
      await attend('ana', local('2026-09-02', '10:00'), { status: 'no_show' });

      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([]);

      ledger.setResetAt(barbershop.id, 'ana', BOOKING_NOW);
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([CONVITE_ANA_30]);
    });

    it('US-25 (C16) (b): skips a paused conversation, and invites once it is resumed', async () => {
      const { send, attend, textsTo, pause, resume } = await withAnaOptedIn();
      await attend('ana', LAST_VISIT);
      await pause('ana');

      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([]);

      await resume('ana');
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([CONVITE_ANA_30]);
    });

    it('US-25 (C17): sends no invite while disconnected or suspended', async () => {
      const { send, attend, textsTo, connect, suspend, unsuspend } =
        await withAnaOptedIn();
      await attend('ana', LAST_VISIT);

      await connect('disconnected');
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([]);

      await connect('connected');
      suspend();
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([]);

      unsuspend();
      await send.execute();
      expect(textsTo(ANA_PHONE)).toEqual([CONVITE_ANA_30]);
    });

    it('US-25 (C18): keeps the claim of an invite whose send failed and never resends it', async () => {
      const { send, attend, connector, barbershop } = await withAnaOptedIn();
      await attend('ana', LAST_VISIT);
      connector.failing.add('sendText');

      const result = await send.execute();

      expect(result.sendFailures).toEqual([
        {
          barbershopId: barbershop.id,
          clientId: 'ana',
          kind: 'invite',
          error: expect.any(Error) as Error,
        },
      ]);
      connector.failing.clear();
      await send.execute();
      expect(connector.sentTexts).toEqual([]);
    });

    it('US-25 (C19): a failing barbershop is recorded and the next one still gets its messages', async () => {
      const {
        send,
        attend,
        textsTo,
        clients,
        barbershop,
        addFailingBarbershop,
      } = await setupReturnReminders();
      await addFailingBarbershop();
      await attend('ana', local(TODAY, '10:00'));
      clients.setReturnReminder(barbershop.id, 'bruno', { enabled: true });
      await attend('bruno', LAST_VISIT);

      const result = await send.execute();

      expect(result.failures).toEqual([
        { barbershopId: 'barbershop-0', error: expect.any(Error) as Error },
      ]);
      expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA]);
      expect(textsTo(BRUNO_PHONE)).toEqual([convite('Bruno', 30)]);
    });
  });

  it('US-25 (C24): counts each question and invite by outcome', async () => {
    const { send, attend, connector, clients, barbershop, metrics } =
      await setupReturnReminders();
    await attend('ana', local(TODAY, '10:00'));
    clients.setReturnReminder(barbershop.id, 'bruno', { enabled: true });
    await attend('bruno', LAST_VISIT);

    await send.execute();
    expect([...metrics.messages].sort()).toEqual([
      'invite:sent',
      'question:sent',
    ]);

    const failing = await setupReturnReminders();
    await failing.attend('ana', local(TODAY, '10:00'));
    failing.clients.setReturnReminder(failing.barbershop.id, 'bruno', {
      enabled: true,
    });
    await failing.attend('bruno', LAST_VISIT);
    failing.connector.failing.add('sendText');

    await failing.send.execute();
    expect([...failing.metrics.messages].sort()).toEqual([
      'invite:failed',
      'question:failed',
    ]);
    expect(connector.sentTexts).toHaveLength(2);
  });
});

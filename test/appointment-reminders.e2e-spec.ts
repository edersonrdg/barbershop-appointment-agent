import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AppointmentRemindersJob } from '../src/infrastructure/jobs/appointment-reminders.job';
import { CLOCK } from '../src/usecases/ports/clock.port';
import { EMAIL_SENDER } from '../src/usecases/ports/email-sender.port';
import {
  MESSAGE_INTERPRETER,
  MessageInterpretation,
} from '../src/usecases/ports/message-interpreter.port';
import { WHATSAPP_CONNECTOR } from '../src/usecases/ports/whatsapp-connector.port';
import { SendAppointmentRemindersUseCase } from '../src/usecases/send-appointment-reminders/send-appointment-reminders.use-case';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { FakeMessageInterpreter } from '../src/usecases/testing/fake-message-interpreter';
import { FakeWhatsAppConnector } from '../src/usecases/testing/fake-whatsapp-connector';
import { SettableClock } from '../src/usecases/testing/settable-clock';
import { signupOwner } from './support/account-flows';
import { stopScheduledJobs } from './support/stop-scheduled-jobs';
import { truncateAccountTables } from './support/truncate-account-tables';

// Tuesday, 29/09, 12:00 in America/Sao_Paulo.
const NOW = new Date('2026-09-29T15:00:00.000Z');
const NOW_SECONDS = 1790694000;
const CREATED = new Date('2026-09-27T12:00:00.000Z');
const TOMORROW = '2026-09-30';
const PHONE = '+5511987654321';
const JID = '5511987654321@s.whatsapp.net';
/** X: Wednesday 30/09 at 11:00 local. */
const X_STARTS = new Date('2026-09-30T14:00:00.000Z');
/** Z: Tuesday 29/09 at 13:00 local, its 1h reminder is due at NOW. */
const Z_STARTS = new Date('2026-09-29T16:00:00.000Z');
const X_REMINDER =
  'Lembrete do seu horário na Barbearia do Zé:\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 11:00\n\nResponda *confirmar* para confirmar presença, *remarcar* para trocar o horário ou *cancelar* para desmarcar.';
const X_CONFIRMED =
  'Presença confirmada!\nCorte, quarta-feira, 30/09, às 11:00, com João';

function interpretation(
  partial: Partial<MessageInterpretation> = {},
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
    cancelRequested: false,
    rescheduleRequested: false,
    confirmRequested: false,
    choice: null,
    addOnAccepted: false,
    waitlistAccepted: false,
    offerDeclined: false,
    ...partial,
  };
}

interface ScheduleItemBody {
  id: string;
  clientConfirmedAt: string | null;
  unconfirmed: boolean;
}

interface ReminderRow {
  reminder_24h_sent_at: Date | null;
  reminder_1h_sent_at: Date | null;
  client_confirmed_at: Date | null;
  status: string;
}

describe('Appointment reminders (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let connector: FakeWhatsAppConnector;
  let interpreter: FakeMessageInterpreter;
  let clock: SettableClock;
  let webhookSecret: string;

  let owner: string;
  let shop: string;
  let corte: string;
  let joao: string;
  let client: string;

  async function barbershopOf(email: string): Promise<string> {
    const [row] = await dataSource.query<{ barbershop_id: string }[]>(
      'SELECT barbershop_id FROM users WHERE email = $1',
      [email],
    );
    return row.barbershop_id;
  }

  async function insertAppointment(
    startsAt: Date,
    { createdAt = CREATED }: { createdAt?: Date } = {},
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', 'manual', $7)`,
      [
        id,
        shop,
        joao,
        client,
        startsAt,
        new Date(startsAt.getTime() + 30 * 60 * 1000),
        createdAt,
      ],
    );
    await dataSource.query(
      `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
       VALUES ($1, 0, $2, $3)`,
      [id, corte, shop],
    );
    return id;
  }

  async function rowOf(id: string): Promise<ReminderRow> {
    const [row] = await dataSource.query<ReminderRow[]>(
      `SELECT reminder_24h_sent_at, reminder_1h_sent_at, client_confirmed_at, status
       FROM appointments WHERE id = $1`,
      [id],
    );
    return row;
  }

  function webhook(text: string) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp/evolution')
      .set('authorization', `Bearer ${webhookSecret}`)
      .send({
        event: 'messages.upsert',
        instance: shop,
        data: {
          key: { remoteJid: JID, fromMe: false, id: randomUUID() },
          pushName: 'Carlos Souza',
          message: { conversation: text },
          messageType: 'conversation',
          messageTimestamp: NOW_SECONDS,
        },
        apikey: 'instance-token',
      });
  }

  async function send(
    partial: Partial<MessageInterpretation>,
    text = 'mensagem',
  ): Promise<void> {
    interpreter.next = interpretation(partial);
    await webhook(text).expect(204);
  }

  const texts = (): string[] => connector.sentTexts.map((sent) => sent.text);

  async function scheduleOf(date: string): Promise<ScheduleItemBody[]> {
    const response = await request(app.getHttpServer())
      .get('/appointments')
      .query({ view: 'day', date })
      .set('Authorization', `Bearer ${owner}`)
      .expect(200);
    return (response.body as { appointments: ScheduleItemBody[] }).appointments;
  }

  async function metricsText(): Promise<string> {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);
    return response.text;
  }

  function metricValue(metrics: string, line: string): number {
    const found = metrics
      .split('\n')
      .find((item) => item.startsWith(`${line} `));
    return found ? Number(found.split(' ')[1]) : 0;
  }

  beforeAll(async () => {
    connector = new FakeWhatsAppConnector();
    interpreter = new FakeMessageInterpreter();
    clock = new SettableClock(NOW);
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(new FakeEmailSender())
      .overrideProvider(CLOCK)
      .useValue(clock)
      .overrideProvider(WHATSAPP_CONNECTOR)
      .useValue(connector)
      .overrideProvider(MESSAGE_INTERPRETER)
      .useValue(interpreter)
      .compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>();
    await app.init();
    stopScheduledJobs(app);
    dataSource = app.get(DataSource);
    webhookSecret = app
      .get(ConfigService)
      .getOrThrow<string>('WHATSAPP_WEBHOOK_SECRET');
  });

  beforeEach(async () => {
    connector.reset();
    interpreter.reset();
    clock.current = NOW;
    await truncateAccountTables(dataSource);
    owner = (await signupOwner(app, 'dono@a.com')).accessToken;
    shop = await barbershopOf('dono@a.com');
    await dataSource.query('UPDATE barbershops SET name = $2 WHERE id = $1', [
      shop,
      'Barbearia do Zé',
    ]);
    await dataSource.query(
      `INSERT INTO whatsapp_connections (barbershop_id, status, disconnected_at, updated_at)
       VALUES ($1, 'connected', NULL, $2)`,
      [shop, NOW],
    );
    for (let weekday = 1; weekday <= 6; weekday += 1) {
      await dataSource.query(
        `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at)
         VALUES ($1, $2, '09:00', '19:00')`,
        [shop, weekday],
      );
    }
    corte = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, 'Corte', 4500, 30, true, now())`,
      [corte, shop],
    );
    joao = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, 'João', NULL, true, now())`,
      [joao, shop],
    );
    await dataSource.query(
      `INSERT INTO barber_services (barber_id, service_id, barbershop_id, position)
       VALUES ($1, $2, $3, 0)`,
      [joao, corte, shop],
    );
    for (let weekday = 1; weekday <= 6; weekday += 1) {
      await dataSource.query(
        `INSERT INTO barber_working_hours (barber_id, weekday, starts_at, ends_at)
         VALUES ($1, $2, '09:00', '19:00')`,
        [joao, weekday],
      );
    }
    client = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at, privacy_notice_sent_at)
       VALUES ($1, $2, 'Carlos Souza', $3, now(), $4)`,
      [client, shop, PHONE, NOW],
    );
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('US-19', () => {
    it('door 3 (C35): registers the reminders cron every minute in America/Sao_Paulo', () => {
      const job = app
        .get(SchedulerRegistry)
        .getCronJob('appointment-reminders');

      expect(job.cronTime.source).toBe('* * * * *');
      expect(job.cronTime.timeZone).toBe('America/Sao_Paulo');
    });

    it('AC 12 (C14): two concurrent runs send the reminder once', async () => {
      const x = await insertAppointment(X_STARTS);
      const useCase = app.get(SendAppointmentRemindersUseCase);

      await Promise.all([useCase.execute(), useCase.execute()]);

      expect(texts()).toEqual([X_REMINDER]);
      expect((await rowOf(x)).reminder_24h_sent_at).toEqual(NOW);
    });

    it('CA-19.1, CA-19.2 (C24): the job reminds, the client confirms and the schedule shows the confirmation', async () => {
      const x = await insertAppointment(X_STARTS);

      await app.get(AppointmentRemindersJob).run();
      expect(connector.sentTexts).toEqual([
        { barbershopId: shop, phone: PHONE, text: X_REMINDER },
      ]);

      await send({ confirmRequested: true }, 'confirmar');

      expect(texts()[1]).toBe(X_CONFIRMED);
      expect((await rowOf(x)).client_confirmed_at).toEqual(NOW);
      expect(await scheduleOf(TOMORROW)).toEqual([
        expect.objectContaining({
          id: x,
          clientConfirmedAt: NOW.toISOString(),
          unconfirmed: false,
        }),
      ]);
    });

    it('CA-19.2, CA-19.6 (C25): cancelling after the reminder follows US-18 and the 1h reminder is not sent', async () => {
      const x = await insertAppointment(X_STARTS);
      await app.get(AppointmentRemindersJob).run();

      await send({ cancelRequested: true }, 'quero cancelar');

      expect(texts()[1]).toBe(
        'Agendamento cancelado.\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 11:00',
      );
      expect((await rowOf(x)).status).toBe('cancelled');

      clock.current = new Date('2026-09-30T13:01:00.000Z');
      await app.get(AppointmentRemindersJob).run();

      expect(texts()).toHaveLength(2);
      expect((await rowOf(x)).reminder_1h_sent_at).toBeNull();
    });

    it('AC 19 (C26): counts the confirmation without labels', async () => {
      await insertAppointment(X_STARTS);
      await app.get(AppointmentRemindersJob).run();
      const before = await metricsText();

      await send({ confirmRequested: true }, 'confirmar');

      const after = await metricsText();
      expect(
        metricValue(after, 'whatsapp_presence_confirmations_total') -
          metricValue(before, 'whatsapp_presence_confirmations_total'),
      ).toBe(1);
      expect(
        metricValue(
          after,
          'whatsapp_replies_total{kind="presence_confirmed"}',
        ) -
          metricValue(
            before,
            'whatsapp_replies_total{kind="presence_confirmed"}',
          ),
      ).toBe(1);
      expect(
        after
          .split('\n')
          .filter((line) =>
            line.startsWith('whatsapp_presence_confirmations_total'),
          ),
      ).toEqual([
        expect.stringMatching(/^whatsapp_presence_confirmations_total \d+$/),
      ]);
    });

    it('AC 20 (C27): counts the reminders by kind and outcome only', async () => {
      await insertAppointment(X_STARTS);
      await insertAppointment(Z_STARTS);
      const sendText = connector.sendText.bind(connector);
      connector.sendText = (barbershopId, phone, text) =>
        text.startsWith('Seu horário')
          ? Promise.reject(new Error('vendor down'))
          : sendText(barbershopId, phone, text);
      const before = await metricsText();

      await app.get(AppointmentRemindersJob).run();

      connector.sendText = sendText;
      const after = await metricsText();
      const delta = (line: string) =>
        metricValue(after, line) - metricValue(before, line);
      expect(delta('whatsapp_reminders_total{kind="24h",outcome="sent"}')).toBe(
        1,
      );
      expect(
        delta('whatsapp_reminders_total{kind="1h",outcome="failed"}'),
      ).toBe(1);
      for (const line of after
        .split('\n')
        .filter((item) => item.startsWith('whatsapp_reminders_total{'))) {
        expect(line).toMatch(
          /^whatsapp_reminders_total\{kind="(24h|1h)",outcome="(sent|failed)"\} \d+$/,
        );
      }
    });

    it('CA-19.5, AC 21, AC 22, AC 23 (C30): the schedule flags the reminded appointment once the cancellation deadline arrives', async () => {
      const x = await insertAppointment(X_STARTS);
      await dataSource.query(
        'UPDATE appointments SET reminder_24h_sent_at = $2 WHERE id = $1',
        [x, NOW],
      );

      clock.current = new Date('2026-09-30T12:01:00.000Z');
      expect(await scheduleOf(TOMORROW)).toEqual([
        expect.objectContaining({
          id: x,
          unconfirmed: true,
          clientConfirmedAt: null,
        }),
      ]);

      clock.current = new Date('2026-09-30T11:59:00.000Z');
      expect(await scheduleOf(TOMORROW)).toEqual([
        expect.objectContaining({ id: x, unconfirmed: false }),
      ]);
    });

    it('AC 23 (C31): the client profile, the block conflict and the attendance answers carry clientConfirmedAt', async () => {
      const x = await insertAppointment(X_STARTS);
      await dataSource.query(
        'UPDATE appointments SET reminder_24h_sent_at = $2, client_confirmed_at = $2 WHERE id = $1',
        [x, NOW],
      );
      const started = await insertAppointment(
        new Date('2026-09-29T13:00:00.000Z'),
      );

      const profile = await request(app.getHttpServer())
        .get(`/clients/${client}`)
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);
      expect(
        (profile.body as { upcomingAppointments: ScheduleItemBody[] })
          .upcomingAppointments,
      ).toEqual([
        expect.objectContaining({
          id: x,
          clientConfirmedAt: '2026-09-29T15:00:00.000Z',
        }),
      ]);

      const conflict = await request(app.getHttpServer())
        .post('/blocks')
        .set('Authorization', `Bearer ${owner}`)
        .send({
          kind: 'block',
          barberId: joao,
          date: TOMORROW,
          start: '10:30',
          end: '11:30',
        })
        .expect(409);
      expect(
        (conflict.body as { appointments: ScheduleItemBody[] }).appointments,
      ).toEqual([
        expect.objectContaining({
          id: x,
          clientConfirmedAt: '2026-09-29T15:00:00.000Z',
        }),
      ]);

      const attendance = await request(app.getHttpServer())
        .patch(`/appointments/${started}/status`)
        .set('Authorization', `Bearer ${owner}`)
        .send({ status: 'attended' })
        .expect(200);
      expect(
        (attendance.body as { appointment: ScheduleItemBody }).appointment
          .clientConfirmedAt,
      ).toBeNull();
    });
  });
});

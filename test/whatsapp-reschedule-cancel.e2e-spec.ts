import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CLOCK } from '../src/usecases/ports/clock.port';
import { EMAIL_SENDER } from '../src/usecases/ports/email-sender.port';
import {
  MESSAGE_INTERPRETER,
  MessageInterpretation,
} from '../src/usecases/ports/message-interpreter.port';
import { WHATSAPP_CONNECTOR } from '../src/usecases/ports/whatsapp-connector.port';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { FakeMessageInterpreter } from '../src/usecases/testing/fake-message-interpreter';
import { FakeWhatsAppConnector } from '../src/usecases/testing/fake-whatsapp-connector';
import { FixedClock } from '../src/usecases/testing/fixed-clock';
import { signupOwner } from './support/account-flows';
import { truncateAccountTables } from './support/truncate-account-tables';
import { stopScheduledJobs } from './support/stop-scheduled-jobs';

// Tuesday, 29/09, 12:00 in America/Sao_Paulo.
const NOW = new Date('2026-09-29T15:00:00.000Z');
const NOW_SECONDS = 1790694000;
const TODAY = '2026-09-29';
const TOMORROW = '2026-09-30';
const PHONE = '+5511987654321';
const JID = '5511987654321@s.whatsapp.net';
const HANDOFF = 'Vou chamar alguém da equipe para te ajudar.';
const CANCEL: Partial<MessageInterpretation> = { cancelRequested: true };
const LIST =
  'Você tem mais de um agendamento. Qual deles?\n1. Corte, terça-feira, 29/09, às 15:00, com João\n2. Corte, quarta-feira, 30/09, às 10:00, com João\nResponda com o número do agendamento.';

const at = (date: string, time: string): Date =>
  new Date(`${date}T${time}:00-03:00`);

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
    ...partial,
  };
}

interface AppointmentRow {
  id: string;
  origin: string;
  status: string;
  starts_at: Date;
}

describe('WhatsApp reschedule and cancel (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let connector: FakeWhatsAppConnector;
  let interpreter: FakeMessageInterpreter;
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

  async function openWeek(barbershopId: string): Promise<void> {
    for (let weekday = 1; weekday <= 6; weekday += 1) {
      await dataSource.query(
        `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at)
         VALUES ($1, $2, '09:00', '19:00')`,
        [barbershopId, weekday],
      );
    }
  }

  async function insertBarber(name: string, serviceId: string) {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, NULL, true, now())`,
      [id, shop, name],
    );
    await dataSource.query(
      `INSERT INTO barber_services (barber_id, service_id, barbershop_id, position)
       VALUES ($1, $2, $3, 0)`,
      [id, serviceId, shop],
    );
    for (let weekday = 1; weekday <= 6; weekday += 1) {
      await dataSource.query(
        `INSERT INTO barber_working_hours (barber_id, weekday, starts_at, ends_at)
         VALUES ($1, $2, '09:00', '19:00')`,
        [id, weekday],
      );
    }
    return id;
  }

  async function insertAppointment(startsAt: Date): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', 'manual', now())`,
      [
        id,
        shop,
        joao,
        client,
        startsAt,
        new Date(startsAt.getTime() + 30 * 60 * 1000),
      ],
    );
    await dataSource.query(
      `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
       VALUES ($1, 0, $2, $3)`,
      [id, corte, shop],
    );
    return id;
  }

  async function appointments(): Promise<AppointmentRow[]> {
    return dataSource.query<AppointmentRow[]>(
      `SELECT id, origin, status, starts_at FROM appointments
        WHERE barbershop_id = $1 ORDER BY starts_at`,
      [shop],
    );
  }

  async function statusOf(id: string): Promise<string> {
    const [row] = await dataSource.query<{ status: string }[]>(
      'SELECT status FROM appointments WHERE id = $1',
      [id],
    );
    return row.status;
  }

  function webhook(text: string, id = randomUUID()) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp/evolution')
      .set('authorization', `Bearer ${webhookSecret}`)
      .send({
        event: 'messages.upsert',
        instance: shop,
        data: {
          key: { remoteJid: JID, fromMe: false, id },
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

  function texts(): string[] {
    return connector.sentTexts.map((sent) => sent.text);
  }

  async function metricLines(name: string): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);
    return response.text
      .split('\n')
      .filter((line) => line.startsWith(`${name}{`));
  }

  async function metricValue(line: string): Promise<number> {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);
    const found = response.text
      .split('\n')
      .find((item) => item.startsWith(`${line} `));
    return found ? Number(found.split(' ')[1]) : 0;
  }

  beforeAll(async () => {
    connector = new FakeWhatsAppConnector();
    interpreter = new FakeMessageInterpreter();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(new FakeEmailSender())
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(NOW))
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
    interpreter.inputs.length = 0;
    await truncateAccountTables(dataSource);
    owner = (await signupOwner(app, 'dono@a.com')).accessToken;
    shop = await barbershopOf('dono@a.com');
    await dataSource.query(
      'UPDATE barbershops SET name = $2, address = $3 WHERE id = $1',
      [shop, 'Barbearia do Zé', 'Rua das Flores, 123'],
    );
    await dataSource.query(
      `INSERT INTO whatsapp_connections (barbershop_id, status, disconnected_at, updated_at)
       VALUES ($1, 'connected', NULL, $2)`,
      [shop, NOW],
    );
    await openWeek(shop);
    corte = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, 'Corte', 4500, 30, true, now())`,
      [corte, shop],
    );
    joao = await insertBarber('João', corte);
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

  describe('US-18', () => {
    it('CA-18.1, CA-18.2 (C34): cancels the chosen appointment and the panel shows it cancelled', async () => {
      const first = await insertAppointment(at(TODAY, '15:00'));
      const second = await insertAppointment(at(TOMORROW, '10:00'));

      await send(CANCEL, 'quero cancelar');
      expect(texts()).toEqual([LIST]);
      await send({ choice: 2 }, 'o de amanhã');

      expect(texts()[1]).toBe(
        'Agendamento cancelado.\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 10:00',
      );
      expect(await statusOf(second)).toBe('cancelled');
      expect(await statusOf(first)).toBe('confirmed');

      const schedule = await request(app.getHttpServer())
        .get('/appointments')
        .query({ view: 'day', date: TOMORROW })
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);
      expect(
        (schedule.body as { appointments: { id: string; status: string }[] })
          .appointments,
      ).toEqual([expect.objectContaining({ id: second, status: 'cancelled' })]);
      const profile = await request(app.getHttpServer())
        .get(`/clients/${client}`)
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);
      expect(
        (
          profile.body as {
            upcomingAppointments: { id: string; status: string }[];
          }
        ).upcomingAppointments,
      ).toContainEqual(
        expect.objectContaining({ id: second, status: 'cancelled' }),
      );
    });

    it('CA-18.3, CA-18.5 (C35): reschedules to the chosen slot and cancels the old appointment', async () => {
      const old = await insertAppointment(at(TOMORROW, '17:00'));

      await send(
        { rescheduleRequested: true, date: TOMORROW, period: 'morning' },
        'quero remarcar pra amanhã de manhã',
      );
      expect(texts()).toEqual([
        'Horários para Corte (R$ 45,00, 30 min):\n1. quarta-feira, 30/09, às 09:00, com João\n2. quarta-feira, 30/09, às 09:30, com João\n3. quarta-feira, 30/09, às 10:00, com João\nResponda com o número do horário que você quer.',
      ]);
      const rescheduledBefore = await metricValue(
        'whatsapp_replies_total{kind="rescheduled"}',
      );

      await send({ choice: 1 }, 'o primeiro');

      expect(texts()[1]).toBe(
        'Agendamento remarcado!\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 09:00\nValor: R$ 45,00\nEndereço: Rua das Flores, 123',
      );
      const rows = await appointments();
      expect(rows).toEqual([
        expect.objectContaining({
          origin: 'bot',
          status: 'confirmed',
          starts_at: at(TOMORROW, '09:00'),
        }),
        expect.objectContaining({ id: old, status: 'cancelled' }),
      ]);
      expect(
        await metricValue('whatsapp_replies_total{kind="rescheduled"}'),
      ).toBe(rescheduledBefore + 1);
    });

    it('AC 9 (C11): counts the cancellation without client or barbershop labels', async () => {
      await insertAppointment(at(TODAY, '15:00'));
      const cancelledBefore = await metricValue(
        'appointments_cancelled_total{origin="bot"}',
      );
      const repliesBefore = await metricValue(
        'whatsapp_replies_total{kind="cancelled"}',
      );

      await send(CANCEL);

      expect(
        await metricValue('appointments_cancelled_total{origin="bot"}'),
      ).toBe(cancelledBefore + 1);
      expect(
        await metricValue('whatsapp_replies_total{kind="cancelled"}'),
      ).toBe(repliesBefore + 1);
      for (const line of [
        ...(await metricLines('appointments_cancelled_total')),
        ...(await metricLines('whatsapp_replies_total')),
      ]) {
        expect(line).toMatch(/^\w+\{(origin|kind)="[a-z_]+"\} \d+$/);
      }
    });

    it('AC 10 (C12): a cancellation that cannot be confirmed stays cancelled', async () => {
      const appointment = await insertAppointment(at(TODAY, '15:00'));
      connector.failing.add('sendText');

      await send(CANCEL);

      expect(await statusOf(appointment)).toBe('cancelled');
    });

    it('CA-18.4 (C22): a cancellation past the deadline is handed to the team as late_cancellation', async () => {
      const appointment = await insertAppointment(at(TODAY, '13:00'));
      const before = await metricValue(
        'whatsapp_handoffs_total{reason="late_cancellation"}',
      );

      await send(CANCEL);

      expect(texts()).toEqual([
        `Só cancelamos ou remarcamos pelo WhatsApp com pelo menos 2h de antecedência.\n\n${HANDOFF}`,
      ]);
      expect(await statusOf(appointment)).toBe('confirmed');
      const waiting = await request(app.getHttpServer())
        .get('/whatsapp/conversations/waiting-human')
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);
      expect(waiting.body).toEqual({
        conversations: [
          expect.objectContaining({
            clientId: client,
            reason: 'late_cancellation',
          }),
        ],
      });
      expect(
        await metricValue(
          'whatsapp_handoffs_total{reason="late_cancellation"}',
        ),
      ).toBe(before + 1);
    });
  });
});

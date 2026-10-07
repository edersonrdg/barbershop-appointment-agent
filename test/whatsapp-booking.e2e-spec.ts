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
const TOMORROW = '2026-09-30';
const PHONE = '+5511987654321';
const JID = '5511987654321@s.whatsapp.net';
const HANDOFF = 'Vou chamar alguém da equipe para te ajudar.';
const OFFER =
  'Horários para Corte (R$ 45,00, 30 min):\n1. quarta-feira, 30/09, às 12:00, com João\n2. quarta-feira, 30/09, às 12:30, com João\n3. quarta-feira, 30/09, às 13:00, com João\nResponda com o número do horário que você quer.';
const REQUEST: Partial<MessageInterpretation> = {
  bookingRequested: true,
  services: ['Corte'],
  barber: 'João',
  date: TOMORROW,
  period: 'afternoon',
};

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
  client_id: string | null;
  origin: string;
  status: string;
  starts_at: Date;
}

describe('WhatsApp booking (e2e)', () => {
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

  // Monday to Saturday, 09:00-19:00, for the barbershop and the barber.
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

  async function insertNoShow(day: string): Promise<void> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'no_show', 'manual', now())`,
      [
        id,
        shop,
        joao,
        client,
        new Date(`${day}T10:00:00-03:00`),
        new Date(`${day}T10:30:00-03:00`),
      ],
    );
    await dataSource.query(
      `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
       VALUES ($1, 0, $2, $3)`,
      [id, corte, shop],
    );
  }

  async function botAppointments(): Promise<AppointmentRow[]> {
    return dataSource.query<AppointmentRow[]>(
      `SELECT id, client_id, origin, status, starts_at FROM appointments
        WHERE barbershop_id = $1 AND status = 'confirmed'`,
      [shop],
    );
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
    jest.restoreAllMocks();
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

  it('CA-17.1, CA-17.2 (C40): books through the webhook and the day schedule shows the bot origin', async () => {
    await send(REQUEST, 'tem horário amanhã à tarde com o João para corte?');
    expect(texts()).toEqual([OFFER]);

    await send({ choice: 1 }, 'o primeiro');

    expect(texts()[1]).toBe(
      'Agendamento confirmado!\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 12:00\nValor: R$ 45,00\nEndereço: Rua das Flores, 123',
    );
    const rows = await botAppointments();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      client_id: client,
      origin: 'bot',
      status: 'confirmed',
      starts_at: new Date('2026-09-30T15:00:00.000Z'),
    });
    const schedule = await request(app.getHttpServer())
      .get('/appointments')
      .query({ view: 'day', date: TOMORROW })
      .set('Authorization', `Bearer ${owner}`)
      .expect(200);
    const body = schedule.body as {
      appointments: { id: string; origin: string }[];
    };
    expect(body.appointments).toEqual([
      expect.objectContaining({ id: rows[0].id, origin: 'bot' }),
    ]);
  });

  it('AC 21 (C21): two choices from the same offer at once book once', async () => {
    await send(REQUEST);
    connector.reset();
    jest
      .spyOn(interpreter, 'interpret')
      .mockImplementation((input) =>
        Promise.resolve(
          interpretation({ choice: input.text === 'o primeiro' ? 1 : 2 }),
        ),
      );

    await Promise.all([
      webhook('o primeiro').expect(204),
      webhook('o segundo').expect(204),
    ]);

    expect(await botAppointments()).toHaveLength(1);
    expect(
      texts().filter((text) => text.startsWith('Agendamento confirmado!')),
    ).toHaveLength(1);
  });

  it('AC 22 (C22): a summary that cannot be sent keeps the appointment', async () => {
    await send(REQUEST);
    connector.failing.add('sendText');

    await send({ choice: 2 });

    const rows = await botAppointments();
    expect(rows).toHaveLength(1);
    expect(rows[0].starts_at).toEqual(new Date('2026-09-30T15:30:00.000Z'));
  });

  it('US-23 CA-23.1, CA-23.2 (C20): suggests Barba, books Corte + Barba through the webhook', async () => {
    const barba = randomUUID();
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, 'Barba', 3000, 20, true, now())`,
      [barba, shop],
    );
    await dataSource.query(
      `INSERT INTO barber_services (barber_id, service_id, barbershop_id, position)
       VALUES ($1, $2, $3, 1)`,
      [joao, barba, shop],
    );
    await dataSource.query(
      `INSERT INTO service_add_ons (service_id, add_on_service_id, position)
       VALUES ($1, $2, 0)`,
      [corte, barba],
    );

    await send(REQUEST, 'tem horário amanhã à tarde com o João para corte?');
    expect(texts()).toEqual([
      'Quer incluir Barba por +R$ 30,00? Responda "sim" para incluir ou "não" para seguir só com Corte.',
    ]);

    await send({ bookingRequested: true, addOnAccepted: true }, 'sim');
    expect(texts()[1]).toBe(
      'Horários para Corte + Barba (R$ 75,00, 50 min):\n1. quarta-feira, 30/09, às 12:00, com João\n2. quarta-feira, 30/09, às 12:30, com João\n3. quarta-feira, 30/09, às 13:00, com João\nResponda com o número do horário que você quer.',
    );

    await send({ choice: 1 }, 'o primeiro');

    const rows = await dataSource.query<
      { id: string; origin: string; status: string; minutes: number }[]
    >(
      `SELECT id, origin, status,
              EXTRACT(EPOCH FROM ends_at - starts_at)::int / 60 AS minutes
         FROM appointments WHERE barbershop_id = $1 AND client_id = $2`,
      [shop, client],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        origin: 'bot',
        status: 'confirmed',
        minutes: 50,
      }),
    ]);
    const services = await dataSource.query<{ service_id: string }[]>(
      `SELECT service_id FROM appointment_services
        WHERE appointment_id = $1 ORDER BY position`,
      [rows[0].id],
    );
    expect(services.map((row) => row.service_id)).toEqual([corte, barba]);
  });

  it('CA-17.6 (C32): a client blocked by no-shows is handed to the team and listed as blocked_client', async () => {
    await insertNoShow('2026-09-01');
    await insertNoShow('2026-09-02');

    await send({ bookingRequested: true, services: ['Corte'] });

    expect(texts()).toEqual([HANDOFF]);
    expect(await botAppointments()).toEqual([]);
    const waiting = await request(app.getHttpServer())
      .get('/whatsapp/conversations/waiting-human')
      .set('Authorization', `Bearer ${owner}`)
      .expect(200);
    expect(waiting.body).toEqual({
      conversations: [
        expect.objectContaining({ clientId: client, reason: 'blocked_client' }),
      ],
    });
  });

  it('US-22 CA-22.1 (C3): a client unblocked by the owner books through the bot again', async () => {
    await insertNoShow('2026-09-01');
    await insertNoShow('2026-09-02');

    await request(app.getHttpServer())
      .post(`/clients/${client}/unblock`)
      .set('Authorization', `Bearer ${owner}`)
      .expect(204);
    await send(REQUEST, 'tem horário amanhã à tarde com o João para corte?');
    expect(texts()).toEqual([OFFER]);
    await send({ choice: 1 }, 'o primeiro');

    const rows = await botAppointments();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      client_id: client,
      origin: 'bot',
      status: 'confirmed',
    });
    const waiting = await request(app.getHttpServer())
      .get('/whatsapp/conversations/waiting-human')
      .set('Authorization', `Bearer ${owner}`)
      .expect(200);
    expect(waiting.body).toEqual({ conversations: [] });
  });

  it('AC 39 (C34): counts the offer, the summary and the bot booking', async () => {
    const booking = 'whatsapp_replies_total{kind="booking"}';
    const booked = 'whatsapp_replies_total{kind="booked"}';
    const bot = 'appointments_booked_total{origin="bot"}';
    const before = {
      booking: await metricValue(booking),
      booked: await metricValue(booked),
      bot: await metricValue(bot),
    };

    await send(REQUEST);
    await send({ choice: 1 });

    expect(await metricValue(booking)).toBe(before.booking + 1);
    expect(await metricValue(booked)).toBe(before.booked + 1);
    expect(await metricValue(bot)).toBe(before.bot + 1);
    const metrics = await request(app.getHttpServer()).get('/metrics');
    const lines = metrics.text
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('whatsapp_replies_total{') ||
          line.startsWith('appointments_booked_total{'),
      );
    for (const line of lines) {
      expect(line).toMatch(/^\w+\{(kind|origin)="[a-z_]+"\} \d+$/);
    }
  });
});

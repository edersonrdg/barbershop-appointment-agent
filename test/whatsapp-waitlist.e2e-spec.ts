import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  WAITLIST_JOB,
  WaitlistJob,
} from '../src/infrastructure/jobs/waitlist.job';
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
import { stopScheduledJobs } from './support/stop-scheduled-jobs';
import { truncateAccountTables } from './support/truncate-account-tables';

// Tuesday, 29/09, 12:00 in America/Sao_Paulo.
const NOW = new Date('2026-09-29T15:00:00.000Z');
const NOW_SECONDS = 1790694000;
const TOMORROW = '2026-09-30';
const CARLOS_PHONE = '+5511987654321';
const BRUNO_PHONE = '+5511911110002';
const PROPOSTA_DIA =
  'Se preferir, posso te colocar na lista de espera para Corte à tarde em quarta-feira, 30/09 e te aviso se vagar um horário. Responda "lista de espera" para entrar.';
const INSCRITO =
  'Pronto! Você está na lista de espera para Corte à tarde em quarta-feira, 30/09. Se vagar um horário, eu te aviso por aqui.';
const OFERTA =
  'Vagou um horário: Corte, quarta-feira, 30/09, às 15:00, com João (R$ 45,00, 30 min). Responda "sim" em até 15 min para agendar ou "não" para recusar.';

const at = (time: string, date = TOMORROW): Date =>
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
    waitlistAccepted: false,
    offerDeclined: false,
    returnReminder: null,
    ...partial,
  };
}

describe('WhatsApp waitlist (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let connector: FakeWhatsAppConnector;
  let interpreter: FakeMessageInterpreter;
  let webhookSecret: string;
  let job: WaitlistJob;

  let shop: string;
  let corte: string;
  let joao: string;
  let carlos: string;
  let bruno: string;

  async function insertClient(name: string, phone: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at, privacy_notice_sent_at)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [id, shop, name, phone, NOW],
    );
    return id;
  }

  async function insertAppointment(
    clientId: string,
    startsAt: Date,
    status: 'confirmed' | 'cancelled',
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'bot', now())`,
      [
        id,
        shop,
        joao,
        clientId,
        startsAt,
        new Date(startsAt.getTime() + 30 * 60 * 1000),
        status,
      ],
    );
    await dataSource.query(
      `INSERT INTO appointment_services (appointment_id, position, service_id, barbershop_id)
       VALUES ($1, 0, $2, $3)`,
      [id, corte, shop],
    );
    return id;
  }

  async function block(startsAt: Date, endsAt: Date): Promise<void> {
    await dataSource.query(
      `INSERT INTO barber_blocks (id, barbershop_id, barber_id, kind, starts_at, ends_at, created_at)
       VALUES ($1, $2, $3, 'block', $4, $5, now())`,
      [randomUUID(), shop, joao, startsAt, endsAt],
    );
  }

  async function enlist(clientId: string, createdAt: Date): Promise<void> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO waitlist_entries (id, barbershop_id, client_id, barber_id, starts_on, ends_on, period, created_at)
       VALUES ($1, $2, $3, NULL, $4, $4, 'afternoon', $5)`,
      [id, shop, clientId, TOMORROW, createdAt],
    );
    await dataSource.query(
      `INSERT INTO waitlist_entry_services (entry_id, position, service_id, barbershop_id)
       VALUES ($1, 0, $2, $3)`,
      [id, corte, shop],
    );
  }

  async function send(
    phone: string,
    partial: Partial<MessageInterpretation>,
  ): Promise<void> {
    interpreter.next = interpretation(partial);
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp/evolution')
      .set('authorization', `Bearer ${webhookSecret}`)
      .send({
        event: 'messages.upsert',
        instance: shop,
        data: {
          key: {
            remoteJid: `${phone.slice(1)}@s.whatsapp.net`,
            fromMe: false,
            id: randomUUID(),
          },
          pushName: 'Cliente',
          message: { conversation: 'mensagem' },
          messageType: 'conversation',
          messageTimestamp: NOW_SECONDS,
        },
        apikey: 'instance-token',
      })
      .expect(204);
  }

  function lastTextTo(phone: string): string | undefined {
    return connector.sentTexts.filter((sent) => sent.phone === phone).at(-1)
      ?.text;
  }

  async function pendingOffers(): Promise<{ client_id: string }[]> {
    return dataSource.query<{ client_id: string }[]>(
      `SELECT e.client_id FROM waitlist_offers o
         JOIN waitlist_entries e ON e.id = o.entry_id
        WHERE o.barbershop_id = $1 AND o.status = 'pending'`,
      [shop],
    );
  }

  async function metrics(): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);
    return response.text.split('\n');
  }

  async function metricValue(line: string): Promise<number> {
    const found = (await metrics()).find((item) => item.startsWith(`${line} `));
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
    job = app.get(WaitlistJob);
    webhookSecret = app
      .get(ConfigService)
      .getOrThrow<string>('WHATSAPP_WEBHOOK_SECRET');
  });

  beforeEach(async () => {
    connector.reset();
    interpreter.inputs.length = 0;
    await truncateAccountTables(dataSource);
    await signupOwner(app, 'dono@a.com');
    const [row] = await dataSource.query<{ barbershop_id: string }[]>(
      'SELECT barbershop_id FROM users WHERE email = $1',
      ['dono@a.com'],
    );
    shop = row.barbershop_id;
    await dataSource.query(
      'UPDATE barbershops SET name = $2, address = $3 WHERE id = $1',
      [shop, 'Barbearia do Zé', 'Rua das Flores, 123'],
    );
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
    carlos = await insertClient('Carlos Souza', CARLOS_PHONE);
    bruno = await insertClient('Bruno Reis', BRUNO_PHONE);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('US-24', () => {
    it('US-24 door 4 (C32): registers the waitlist cron every minute in America/Sao_Paulo', () => {
      const cron = app.get(SchedulerRegistry).getCronJob(WAITLIST_JOB);

      expect(cron.cronTime.source).toBe('* * * * *');
      expect(cron.cronTime.timeZone).toBe('America/Sao_Paulo');
    });

    it('US-24 CA-24.1, CA-24.2, CA-24.3 (C32): joins, gets the slot Bruno cancelled and books it', async () => {
      const accepted = await metricValue(
        'waitlist_offers_total{outcome="accepted"}',
      );
      await block(at('12:00'), at('15:00'));
      await block(at('15:30'), at('18:00'));
      await insertAppointment(bruno, at('15:00'), 'confirmed');

      await send(CARLOS_PHONE, {
        bookingRequested: true,
        services: ['Corte'],
        barber: 'João',
        date: TOMORROW,
        period: 'afternoon',
      });
      expect(lastTextTo(CARLOS_PHONE)?.endsWith(`\n\n${PROPOSTA_DIA}`)).toBe(
        true,
      );

      await send(CARLOS_PHONE, { waitlistAccepted: true });
      expect(lastTextTo(CARLOS_PHONE)).toBe(INSCRITO);

      await send(BRUNO_PHONE, { cancelRequested: true });
      await job.run();
      expect(lastTextTo(CARLOS_PHONE)).toBe(OFERTA);

      await send(CARLOS_PHONE, { choice: 1 });
      const booked = await dataSource.query<
        { client_id: string; origin: string; starts_at: Date }[]
      >(
        `SELECT client_id, origin, starts_at FROM appointments
          WHERE barbershop_id = $1 AND status = 'confirmed'`,
        [shop],
      );
      expect(booked).toEqual([
        { client_id: carlos, origin: 'bot', starts_at: at('15:00') },
      ]);
      await expect(
        metricValue('waitlist_offers_total{outcome="accepted"}'),
      ).resolves.toBe(accepted + 1);
      await expect(
        dataSource.query(
          'SELECT id FROM waitlist_entries WHERE client_id = $1',
          [carlos],
        ),
      ).resolves.toEqual([]);
      await expect(
        dataSource.query(
          'SELECT id FROM waitlist_offers WHERE barbershop_id = $1',
          [shop],
        ),
      ).resolves.toEqual([]);
    });

    it('US-24 AC 14 (C14): two concurrent runs offer a freed slot once', async () => {
      await enlist(carlos, new Date(NOW.getTime() - 60_000));
      await enlist(bruno, NOW);
      await insertAppointment(bruno, at('15:00'), 'cancelled');

      await Promise.all([job.run(), job.run()]);

      await expect(pendingOffers()).resolves.toEqual([{ client_id: carlos }]);
      expect(connector.sentTexts).toEqual([
        { barbershopId: shop, phone: CARLOS_PHONE, text: OFERTA },
      ]);
    });

    it('US-24 AC 14 (C14): an entry with two freed slots gets one pending offer', async () => {
      await enlist(carlos, NOW);
      await insertAppointment(bruno, at('15:00'), 'cancelled');
      await insertAppointment(bruno, at('16:00'), 'cancelled');

      await Promise.all([job.run(), job.run()]);

      await expect(pendingOffers()).resolves.toEqual([{ client_id: carlos }]);
      expect(connector.sentTexts).toHaveLength(1);
    });

    it('US-24 AC 26 (C26): exposes the waitlist counters with the event and outcome labels only', async () => {
      const joined = await metricValue(
        'waitlist_entries_total{event="joined"}',
      );
      const sent = await metricValue('waitlist_offers_total{outcome="sent"}');
      await block(at('12:00'), at('15:00'));
      await block(at('15:30'), at('18:00'));
      await insertAppointment(bruno, at('15:00'), 'confirmed');
      await send(CARLOS_PHONE, {
        bookingRequested: true,
        services: ['Corte'],
        barber: 'João',
        date: TOMORROW,
        period: 'afternoon',
      });
      await send(CARLOS_PHONE, { waitlistAccepted: true });
      await dataSource.query(
        `UPDATE appointments SET status = 'cancelled'
          WHERE barbershop_id = $1 AND status = 'confirmed'`,
        [shop],
      );

      await job.run();

      await expect(
        metricValue('waitlist_entries_total{event="joined"}'),
      ).resolves.toBe(joined + 1);
      await expect(
        metricValue('waitlist_offers_total{outcome="sent"}'),
      ).resolves.toBe(sent + 1);
      const lines = (await metrics()).filter((line) =>
        /^waitlist_(entries|offers)_total\{/.test(line),
      );
      expect(
        lines.some((line) => line.startsWith('waitlist_entries_total{')),
      ).toBe(true);
      expect(
        lines.some((line) => line.startsWith('waitlist_offers_total{')),
      ).toBe(true);
      for (const line of lines) {
        expect(line).toMatch(
          /^waitlist_(entries_total\{event="[a-z_]+"\}|offers_total\{outcome="[a-z_]+"\}) \d+$/,
        );
      }
    });
  });
});

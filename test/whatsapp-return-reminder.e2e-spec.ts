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
  RETURN_REMINDER_JOB,
  ReturnReminderJob,
} from '../src/infrastructure/jobs/return-reminder.job';
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
import { interpretation } from '../src/usecases/testing/return-reminder-fixtures';
import { signupOwner } from './support/account-flows';
import { stopScheduledJobs } from './support/stop-scheduled-jobs';
import { truncateAccountTables } from './support/truncate-account-tables';

// Tuesday, 29/09, 12:00 in America/Sao_Paulo.
const NOW = new Date('2026-09-29T15:00:00.000Z');
const NOW_SECONDS = 1790694000;
const ANA_PHONE = '+5511911110001';
const BRUNO_PHONE = '+5511911110002';
const CARLOS_PHONE = '+5511987654321';
const PERGUNTA =
  'Obrigado pela visita à Barbearia do Zé! Quer que eu te avise quando estiver na hora de voltar? Responda "sim" e eu te mando um lembrete daqui a 30 dias. Se não quiser, é só ignorar.';
const ATIVADO =
  'Combinado! Vou te lembrar de voltar 30 dias depois do seu último atendimento. Para parar, é só responder "parar lembretes".';
const DESATIVADO =
  'Pronto, você não vai mais receber lembretes de retorno. Se mudar de ideia, é só responder "quero lembrete".';
const CONVITE_BRUNO =
  'Oi, Bruno! Já faz 30 dias do seu último atendimento na Barbearia do Zé. Que tal agendar o próximo? É só me dizer o dia e o horário. Para não receber mais este lembrete, responda "parar lembretes".';

const at = (date: string, time: string): Date =>
  new Date(`${date}T${time}:00-03:00`);

interface ConsentRow {
  enabled: boolean;
  channel: string;
}

describe('WhatsApp return reminder (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let connector: FakeWhatsAppConnector;
  let interpreter: FakeMessageInterpreter;
  let webhookSecret: string;
  let job: ReturnReminderJob;

  let shop: string;
  let corte: string;
  let joao: string;
  let ana: string;
  let bruno: string;
  let carlos: string;

  async function insertClient(name: string, phone: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at, privacy_notice_sent_at)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [id, shop, name, phone, NOW],
    );
    return id;
  }

  async function attended(clientId: string, startsAt: Date): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'attended', 'manual', now())`,
      [
        id,
        shop,
        joao,
        clientId,
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

  async function optIn(clientId: string): Promise<void> {
    await dataSource.query(
      'UPDATE clients SET return_reminder_enabled = true WHERE id = $1',
      [clientId],
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

  function textsTo(phone: string): string[] {
    return connector.sentTexts
      .filter((sent) => sent.phone === phone)
      .map((sent) => sent.text);
  }

  async function clientRow(clientId: string) {
    const [row] = await dataSource.query<
      {
        return_reminder_enabled: boolean;
        return_reminder_asked_at: Date | null;
      }[]
    >(
      'SELECT return_reminder_enabled, return_reminder_asked_at FROM clients WHERE id = $1',
      [clientId],
    );
    return row;
  }

  async function consentsOf(clientId: string): Promise<ConsentRow[]> {
    return dataSource.query<ConsentRow[]>(
      `SELECT enabled, channel FROM return_reminder_consents
        WHERE barbershop_id = $1 AND client_id = $2 ORDER BY recorded_at, id`,
      [shop, clientId],
    );
  }

  async function metrics(): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);
    return response.text.split('\n');
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
    job = app.get(ReturnReminderJob);
    webhookSecret = app
      .get(ConfigService)
      .getOrThrow<string>('WHATSAPP_WEBHOOK_SECRET');
  });

  beforeEach(async () => {
    connector.reset();
    interpreter.reset();
    await truncateAccountTables(dataSource);
    await signupOwner(app, 'dono@a.com');
    const [row] = await dataSource.query<{ barbershop_id: string }[]>(
      'SELECT barbershop_id FROM users WHERE email = $1',
      ['dono@a.com'],
    );
    shop = row.barbershop_id;
    await dataSource.query('UPDATE barbershops SET name = $2 WHERE id = $1', [
      shop,
      'Barbearia do Zé',
    ]);
    await dataSource.query(
      `INSERT INTO whatsapp_connections (barbershop_id, status, disconnected_at, updated_at)
       VALUES ($1, 'connected', NULL, $2)`,
      [shop, NOW],
    );
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
    ana = await insertClient('Ana Lima', ANA_PHONE);
    bruno = await insertClient('Bruno Reis', BRUNO_PHONE);
    carlos = await insertClient('Carlos Souza', CARLOS_PHONE);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  it('US-25 AC 24 (C25): exposes the counters with only their closed labels', async () => {
    await attended(ana, at('2026-09-29', '10:00'));
    await job.run();
    await send(ANA_PHONE, { returnReminder: 'enable' });

    const lines = await metrics();

    expect(lines).toContain(
      'return_reminder_messages_total{kind="question",outcome="sent"} 1',
    );
    expect(lines).toContain(
      'return_reminder_opt_in_changes_total{enabled="true"} 1',
    );
    const samples = lines.filter(
      (line) =>
        line.startsWith('return_reminder_messages_total{') ||
        line.startsWith('return_reminder_opt_in_changes_total{'),
    );
    expect(samples.length).toBeGreaterThan(0);
    for (const line of samples) {
      expect(line).toMatch(
        /^(return_reminder_messages_total\{kind="(question|invite)",outcome="(sent|failed)"\}|return_reminder_opt_in_changes_total\{enabled="(true|false)"\}) \d+$/,
      );
    }
  });

  it('US-25 door 3 (C29): registers the return reminder cron every minute in America/Sao_Paulo', () => {
    const cron = app.get(SchedulerRegistry).getCronJob(RETURN_REMINDER_JOB);

    expect(cron.cronTime.source).toBe('* * * * *');
    expect(cron.cronTime.timeZone).toBe('America/Sao_Paulo');
  });

  it('US-25 CA-25.1, CA-25.3, CA-25.5 (C30): asks after the attendance, turns the reminder on and off through the webhook and records both changes', async () => {
    await attended(ana, at('2026-09-29', '10:00'));

    await job.run();

    expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA]);
    expect(await clientRow(ana)).toEqual({
      return_reminder_enabled: false,
      return_reminder_asked_at: NOW,
    });

    await send(ANA_PHONE, { returnReminder: 'enable' });

    expect(interpreter.inputs.at(-1)?.returnReminderQuestion).toBe(true);
    expect((await clientRow(ana)).return_reminder_enabled).toBe(true);
    expect(await consentsOf(ana)).toEqual([
      { enabled: true, channel: 'whatsapp' },
    ]);
    expect(textsTo(ANA_PHONE).at(-1)).toBe(ATIVADO);

    await send(ANA_PHONE, { returnReminder: 'disable' });

    expect((await clientRow(ana)).return_reminder_enabled).toBe(false);
    // Both changes happen at the fixed NOW; C20 proves the order by instant.
    expect(await consentsOf(ana)).toHaveLength(2);
    expect(await consentsOf(ana)).toEqual(
      expect.arrayContaining([
        { enabled: true, channel: 'whatsapp' },
        { enabled: false, channel: 'whatsapp' },
      ]),
    );
    expect(textsTo(ANA_PHONE).at(-1)).toBe(DESATIVADO);
  });

  it('US-25 CA-25.2, CA-25.4 (C31): invites Bruno 30 days after the attendance and nothing goes to Carlos without opt-in', async () => {
    await optIn(bruno);
    const brunoVisit = await attended(bruno, at('2026-08-30', '11:30'));
    await attended(carlos, at('2026-08-30', '11:00'));

    await job.run();

    expect(textsTo(BRUNO_PHONE)).toEqual([CONVITE_BRUNO]);
    expect(textsTo(CARLOS_PHONE)).toEqual([]);
    const [row] = await dataSource.query<
      { return_reminder_sent_at: Date | null }[]
    >('SELECT return_reminder_sent_at FROM appointments WHERE id = $1', [
      brunoVisit,
    ]);
    expect(row.return_reminder_sent_at).toEqual(NOW);
  });

  it('US-25 door 1 (C32): two concurrent runs send one question and one invite', async () => {
    await attended(ana, at('2026-09-29', '10:00'));
    await optIn(bruno);
    await attended(bruno, at('2026-08-30', '11:30'));

    await Promise.all([job.run(), job.run()]);

    expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA]);
    expect(textsTo(BRUNO_PHONE)).toEqual([CONVITE_BRUNO]);
    expect(connector.sentTexts).toHaveLength(2);
  });
});

import { INestApplication, Logger } from '@nestjs/common';
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

const NOW = new Date('2026-09-29T15:00:00.000Z');
const NOW_SECONDS = 1790694000;
const PHONE = '+5511987654321';
const JID = '5511987654321@s.whatsapp.net';
const NEW_JID = '5511955554444@s.whatsapp.net';
const REFUSAL =
  'Desculpe, só posso ajudar com assuntos da Barbearia do Zé: serviços, preços, endereço e horário de funcionamento.';
const UNAVAILABLE =
  'Desculpe, não consegui responder agora. Tente de novo em alguns instantes.';

function interpretation(
  partial: Partial<MessageInterpretation>,
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
    choice: null,
    ...partial,
  };
}

describe('WhatsApp questions (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let connector: FakeWhatsAppConnector;
  let interpreter: FakeMessageInterpreter;
  let webhookSecret: string;
  let policyUrl: string;

  let shopA: string;
  let shopB: string;

  async function barbershopOf(email: string): Promise<string> {
    const [row] = await dataSource.query<{ barbershop_id: string }[]>(
      'SELECT barbershop_id FROM users WHERE email = $1',
      [email],
    );
    return row.barbershop_id;
  }

  async function connectShop(barbershopId: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO whatsapp_connections (barbershop_id, status, disconnected_at, updated_at)
       VALUES ($1, 'connected', NULL, $2)`,
      [barbershopId, NOW],
    );
  }

  async function insertService(
    barbershopId: string,
    name: string,
    priceCents: number,
    durationMinutes: number,
    active = true,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [randomUUID(), barbershopId, name, priceCents, durationMinutes, active],
    );
  }

  // A client that already got the privacy notice, so only the reply is sent.
  async function insertNotifiedClient(barbershopId: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at, privacy_notice_sent_at)
       VALUES ($1, $2, 'João Silva', $3, now(), $4)`,
      [randomUUID(), barbershopId, PHONE, NOW],
    );
  }

  function messageUpsert({
    instance = shopA,
    remoteJid = JID,
    id = randomUUID(),
    message = { conversation: 'quanto custa corte e barba?' },
  }: {
    instance?: string;
    remoteJid?: string;
    id?: string;
    /** `null` sends a message without the `message` field. */
    message?: Record<string, unknown> | null;
  } = {}) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp/evolution')
      .set('authorization', `Bearer ${webhookSecret}`)
      .send({
        event: 'messages.upsert',
        instance,
        data: {
          key: { remoteJid, fromMe: false, id },
          pushName: 'João Silva',
          ...(message === null ? {} : { message }),
          messageType: 'conversation',
          messageTimestamp: NOW_SECONDS,
        },
        apikey: 'instance-token',
      });
  }

  function textsTo(barbershopId = shopA): string[] {
    return connector.sentTexts
      .filter((sent) => sent.barbershopId === barbershopId)
      .map((sent) => sent.text);
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
    dataSource = app.get(DataSource);
    const config = app.get(ConfigService);
    webhookSecret = config.getOrThrow<string>('WHATSAPP_WEBHOOK_SECRET');
    policyUrl = config.getOrThrow<string>('PRIVACY_POLICY_URL');

    await truncateAccountTables(dataSource);
    await signupOwner(app, 'dono@a.com');
    await signupOwner(app, 'dono@b.com', 'Barbearia B');
    shopA = await barbershopOf('dono@a.com');
    shopB = await barbershopOf('dono@b.com');
    await insertService(shopA, 'Corte', 4500, 30);
    await insertService(shopA, 'Barba', 3000, 20);
    await insertService(shopA, 'Hidratação', 6000, 40, false);
    await insertService(shopB, 'Luzes', 9000, 60);
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM whatsapp_inbound_messages');
    await dataSource.query('DELETE FROM appointments');
    await dataSource.query('DELETE FROM clients');
    await dataSource.query('DELETE FROM whatsapp_connections');
    await dataSource.query(
      'UPDATE barbershops SET address = NULL WHERE id = $1',
      [shopA],
    );
    await dataSource.query(
      'DELETE FROM barbershop_opening_hours WHERE barbershop_id = $1',
      [shopA],
    );
    await connectShop(shopA);
    await insertNotifiedClient(shopA);
    connector.reset();
    interpreter.reset();
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('S1 - prices and durations', () => {
    it('CA-15.1 (C1): answers with the registered prices and durations in catalog order', async () => {
      interpreter.next = interpretation({
        topics: ['services'],
        services: ['Corte', 'Barba'],
      });

      await messageUpsert().expect(204);

      expect(connector.sentTexts).toEqual([
        {
          barbershopId: shopA,
          phone: PHONE,
          text: 'Na Barbearia do Zé:\n- Barba: R$ 30,00, 20 min\n- Corte: R$ 45,00, 30 min',
        },
      ]);
      expect(interpreter.inputs).toEqual([
        {
          barbershopName: 'Barbearia do Zé',
          serviceNames: ['Barba', 'Corte'],
          text: 'quanto custa corte e barba?',
          today: { date: '2026-09-29', weekday: 'terça-feira' },
          barberNames: [],
          offeredOptions: [],
          appointmentOptions: [],
        },
      ]);
    });

    it('CA-15.2 (C4): says the barbershop does not offer an unknown service, without a price', async () => {
      interpreter.next = interpretation({
        topics: ['services'],
        unknownServices: ['Pé e mão'],
      });

      await messageUpsert({
        message: { conversation: 'vocês fazem pé e mão?' },
      }).expect(204);

      expect(textsTo()).toEqual(['A Barbearia do Zé não oferece Pé e mão.']);
      expect(textsTo()[0]).not.toContain('R$');
    });
  });

  describe('S2 - address and opening hours', () => {
    it('CA-15.4 (C8): answers with the registered address', async () => {
      await dataSource.query(
        'UPDATE barbershops SET address = $1 WHERE id = $2',
        ['Rua das Flores, 123 - Centro', shopA],
      );
      interpreter.next = interpretation({ topics: ['address'] });

      await messageUpsert({ message: { conversation: 'onde fica?' } }).expect(
        204,
      );

      expect(textsTo()).toEqual([
        'Endereço da Barbearia do Zé: Rua das Flores, 123 - Centro',
      ]);
    });

    it('CA-15.4 (C10): answers with the registered opening hours of every day', async () => {
      await dataSource.query(
        `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at, break_starts_at, break_ends_at)
         VALUES ($1, 1, '09:00', '18:00', '12:00', '13:00'),
                ($1, 2, '09:00', '18:00', NULL, NULL),
                ($1, 3, '09:00', '18:00', NULL, NULL),
                ($1, 4, '09:00', '18:00', NULL, NULL),
                ($1, 5, '09:00', '18:00', NULL, NULL),
                ($1, 6, '08:00', '12:00', NULL, NULL)`,
        [shopA],
      );
      interpreter.next = interpretation({ topics: ['opening_hours'] });

      await messageUpsert({
        message: { conversation: 'que horas vocês abrem?' },
      }).expect(204);

      expect(textsTo()).toEqual([
        'Horário de funcionamento:\nSegunda-feira: 09:00 às 18:00 (intervalo 12:00 às 13:00)\nTerça-feira: 09:00 às 18:00\nQuarta-feira: 09:00 às 18:00\nQuinta-feira: 09:00 às 18:00\nSexta-feira: 09:00 às 18:00\nSábado: 08:00 às 12:00\nDomingo: fechado',
      ]);
    });
  });

  describe('S3 - off-topic and messages without text', () => {
    it('CA-15.3 (C12): refuses an off-topic message sent as an extended text', async () => {
      interpreter.next = interpretation({
        topics: ['services'],
        offTopic: true,
      });

      await messageUpsert({
        message: {
          extendedTextMessage: {
            text: 'me ajuda com um trabalho da faculdade',
          },
        },
      }).expect(204);

      expect(textsTo()).toEqual([REFUSAL]);
      expect(interpreter.inputs.map((input) => input.text)).toEqual([
        'me ajuda com um trabalho da faculdade',
      ]);
    });

    it('AC 14 (C14): does not answer an audio, a blank text or a message without content', async () => {
      await messageUpsert({ message: { audioMessage: {} } }).expect(204);
      await messageUpsert({ message: { conversation: '   ' } }).expect(204);
      await messageUpsert({ message: null }).expect(204);

      expect(interpreter.inputs).toHaveLength(0);
      expect(connector.sentTexts).toHaveLength(0);
    });

    it('AC 14 (C14): an audio from a new number only gets the privacy notice', async () => {
      await messageUpsert({
        remoteJid: NEW_JID,
        message: { audioMessage: {} },
      }).expect(204);

      expect(interpreter.inputs).toHaveLength(0);
      expect(textsTo()).toEqual([
        `Olá! Aqui é o assistente virtual da Barbearia do Zé. O atendimento é feito por inteligência artificial, e usamos seu nome e telefone para agendar seus horários. Política de privacidade: ${policyUrl}`,
      ]);
      const clients = await dataSource.query<unknown[]>(
        'SELECT id FROM clients WHERE barbershop_id = $1 AND phone = $2',
        [shopA, '+5511955554444'],
      );
      expect(clients).toHaveLength(1);
    });
  });

  describe('S4 - order, uniqueness and failures', () => {
    it('AC 15 (C15): sends the privacy notice before the reply, both before the 204', async () => {
      interpreter.next = interpretation({ topics: ['address'] });

      await messageUpsert({
        remoteJid: NEW_JID,
        message: { conversation: 'onde fica?' },
      }).expect(204);

      expect(connector.sentTexts.map((sent) => sent.phone)).toEqual([
        '+5511955554444',
        '+5511955554444',
      ]);
      expect(textsTo()).toEqual([
        expect.stringContaining('Política de privacidade'),
        'A Barbearia do Zé ainda não informou o endereço.',
      ]);
    });

    it('AC 16 (C16): answers a redelivered message once, in parallel and in sequence', async () => {
      await connectShop(shopB);
      await insertNotifiedClient(shopB);
      interpreter.next = interpretation({ topics: ['services'] });
      const id = randomUUID();

      const responses = await Promise.all([
        messageUpsert({ id }),
        messageUpsert({ id }),
      ]);
      await messageUpsert({ id }).expect(204);

      expect(responses.map(({ status }) => status)).toEqual([204, 204]);
      expect(interpreter.inputs).toHaveLength(1);
      expect(textsTo()).toHaveLength(1);

      await messageUpsert({ id, instance: shopB }).expect(204);

      expect(interpreter.inputs).toHaveLength(2);
      expect(textsTo(shopB)).toEqual([
        'Na Barbearia B:\n- Luzes: R$ 90,00, 1h',
      ]);
    });

    it('CA-15.5 (C17): answers the unavailable text when the interpreter fails', async () => {
      interpreter.failing = true;

      await messageUpsert().expect(204);

      expect(textsTo()).toEqual([UNAVAILABLE]);
    });

    it('AC 18 (C19): answers 204 and logs without the phone or the text when the reply cannot be sent', async () => {
      const spies = (['log', 'error', 'warn', 'debug', 'verbose'] as const).map(
        (method) =>
          jest
            .spyOn(Logger.prototype, method)
            .mockImplementation(() => undefined),
      );
      connector.failing.add('sendText');
      interpreter.next = interpretation({ topics: ['services'] });

      try {
        await messageUpsert().expect(204);

        const logged = JSON.stringify(
          spies.flatMap((spy) => spy.mock.calls as unknown[]),
        );
        expect(logged).toContain('Reply could not be sent.');
        expect(logged).toContain(shopA);
        expect(logged).not.toContain('5511987654321');
        expect(logged).not.toContain('quanto custa');
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    });
  });

  describe('S5 - observability and storage', () => {
    it.each<[string, (fake: FakeMessageInterpreter) => void]>([
      [
        'answer',
        (fake) => (fake.next = interpretation({ topics: ['address'] })),
      ],
      ['off_topic', (fake) => (fake.next = interpretation({ offTopic: true }))],
      ['fallback', (fake) => (fake.next = interpretation({}))],
      ['unavailable', (fake) => (fake.failing = true)],
    ])('US-15 (C26): counts a reply of kind %s', async (kind, arrange) => {
      const kinds = ['answer', 'off_topic', 'fallback', 'unavailable'];
      const before = await Promise.all(
        kinds.map((each) =>
          metricValue(`whatsapp_replies_total{kind="${each}"}`),
        ),
      );
      arrange(interpreter);

      await messageUpsert().expect(204);

      const after = await Promise.all(
        kinds.map((each) =>
          metricValue(`whatsapp_replies_total{kind="${each}"}`),
        ),
      );
      expect(after.map((value, index) => value - before[index])).toEqual(
        kinds.map((each) => (each === kind ? 1 : 0)),
      );
    });

    it('US-15 (C29): stores only the barbershop, the message id and when it arrived', async () => {
      const columns = await dataSource.query<
        { column_name: string; data_type: string; is_nullable: string }[]
      >(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns
          WHERE table_name = 'whatsapp_inbound_messages' ORDER BY column_name`,
      );
      expect(columns.map((column) => column.column_name)).toEqual([
        'barbershop_id',
        'message_id',
        'received_at',
      ]);
      expect(
        columns.find((column) => column.column_name === 'received_at'),
      ).toMatchObject({
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      });
      const primaryKey = await dataSource.query<{ column_name: string }[]>(
        `SELECT kcu.column_name FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name
          WHERE tc.table_name = 'whatsapp_inbound_messages'
            AND tc.constraint_type = 'PRIMARY KEY'
          ORDER BY kcu.ordinal_position`,
      );
      expect(primaryKey.map((row) => row.column_name)).toEqual([
        'barbershop_id',
        'message_id',
      ]);

      const id = randomUUID();
      await messageUpsert({ id }).expect(204);

      const rows = await dataSource.query<
        { barbershop_id: string; message_id: string; received_at: Date }[]
      >('SELECT * FROM whatsapp_inbound_messages');
      expect(rows).toEqual([
        { barbershop_id: shopA, message_id: id, received_at: NOW },
      ]);
    });
  });
});

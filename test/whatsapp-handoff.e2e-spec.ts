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
import { createBarber, signupOwner } from './support/account-flows';
import { truncateAccountTables } from './support/truncate-account-tables';

const NOW = new Date('2026-09-29T15:00:00.000Z');
const NOW_SECONDS = 1790694000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const PHONE = '+5511987654321';
const JID = '5511987654321@s.whatsapp.net';
const ANA_PHONE = '+5511955554444';
const NEW_JID = '5511933332222@s.whatsapp.net';
const ADDRESS = 'Rua das Flores, 123 - Centro';
const HANDOFF = 'Vou chamar alguém da equipe para te ajudar.';
const FALLBACK =
  'Posso te ajudar com serviços, preços, endereço e horário de funcionamento da Barbearia do Zé. O que você gostaria de saber?';
const ADDRESS_REPLY = `Endereço da Barbearia do Zé: ${ADDRESS}`;
const FORBIDDEN = { message: 'Acesso negado.' };
const CLIENT_NOT_FOUND = { message: 'Cliente não encontrado.' };

function interpretation(
  partial: Partial<MessageInterpretation> = {},
): MessageInterpretation {
  return {
    topics: [],
    services: [],
    unknownServices: [],
    offTopic: false,
    humanRequested: false,
    ...partial,
  };
}

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

interface ConversationRow {
  consecutive_failures: number;
  paused_at: Date | null;
  pause_reason: string | null;
  last_activity_at: Date;
}

describe('WhatsApp hand-off to a human (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let connector: FakeWhatsAppConnector;
  let interpreter: FakeMessageInterpreter;
  let webhookSecret: string;

  let shopA: string;
  let shopB: string;
  let ownerA: string;
  let ownerB: string;
  let barberA: string;
  let joao: string;

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

  // A client that already got the privacy notice, so only the reply is sent.
  async function insertNotifiedClient(
    barbershopId: string,
    name = 'João Silva',
    phone = PHONE,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at, privacy_notice_sent_at)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [id, barbershopId, name, phone, NOW],
    );
    return id;
  }

  async function insertConversation(
    barbershopId: string,
    clientId: string,
    {
      failures = 0,
      pausedAgo = null,
      reason = 'requested',
      lastActivityAgo = pausedAgo ?? HOUR_MS,
    }: {
      failures?: number;
      pausedAgo?: number | null;
      reason?: string;
      lastActivityAgo?: number;
    } = {},
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO whatsapp_conversations
         (barbershop_id, client_id, consecutive_failures, paused_at, pause_reason, last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        barbershopId,
        clientId,
        failures,
        pausedAgo === null ? null : ago(pausedAgo),
        pausedAgo === null ? null : reason,
        ago(lastActivityAgo),
      ],
    );
  }

  async function conversationOf(
    clientId: string,
    barbershopId = shopA,
  ): Promise<ConversationRow | undefined> {
    const [row] = await dataSource.query<ConversationRow[]>(
      `SELECT consecutive_failures, paused_at, pause_reason, last_activity_at
         FROM whatsapp_conversations
        WHERE barbershop_id = $1 AND client_id = $2`,
      [barbershopId, clientId],
    );
    return row;
  }

  function messageUpsert({
    instance = shopA,
    remoteJid = JID,
    id = randomUUID(),
    fromMe = false,
    message = { conversation: 'quero falar com alguém' },
  }: {
    instance?: string;
    remoteJid?: string;
    id?: string;
    fromMe?: boolean;
    message?: Record<string, unknown>;
  } = {}) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp/evolution')
      .set('authorization', `Bearer ${webhookSecret}`)
      .send({
        event: 'messages.upsert',
        instance,
        data: {
          key: { remoteJid, fromMe, id },
          pushName: 'João Silva',
          message,
          messageType: 'conversation',
          messageTimestamp: NOW_SECONDS,
        },
        apikey: 'instance-token',
      });
  }

  function resume(clientId: string, token: string | null = ownerA) {
    const call = request(app.getHttpServer()).post(
      `/whatsapp/conversations/${clientId}/resume`,
    );
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function listWaiting(token: string | null = ownerA) {
    const call = request(app.getHttpServer()).get(
      '/whatsapp/conversations/waiting-human',
    );
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function textsTo(barbershopId = shopA): string[] {
    return connector.sentTexts
      .filter((sent) => sent.barbershopId === barbershopId)
      .map((sent) => sent.text);
  }

  async function metricsText(): Promise<string> {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);
    return response.text;
  }

  async function metricValue(line: string): Promise<number> {
    const found = (await metricsText())
      .split('\n')
      .find((item) => item.startsWith(`${line} `));
    return found ? Number(found.split(' ')[1]) : 0;
  }

  beforeAll(async () => {
    connector = new FakeWhatsAppConnector();
    interpreter = new FakeMessageInterpreter();
    const emailSender = new FakeEmailSender();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
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

    await truncateAccountTables(dataSource);
    ownerA = (await signupOwner(app, 'dono@a.com')).accessToken;
    ownerB = (await signupOwner(app, 'dono@b.com', 'Barbearia B')).accessToken;
    shopA = await barbershopOf('dono@a.com');
    shopB = await barbershopOf('dono@b.com');
    barberA = await createBarber(
      app,
      emailSender,
      config.getOrThrow<string>('APP_WEB_URL'),
      ownerA,
      'barbeiro@a.com',
    );
    await dataSource.query(
      'UPDATE barbershops SET address = $2 WHERE id = $1',
      [shopA, ADDRESS],
    );
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM whatsapp_inbound_messages');
    await dataSource.query('DELETE FROM whatsapp_conversations');
    await dataSource.query('DELETE FROM appointments');
    await dataSource.query('DELETE FROM clients');
    await dataSource.query('DELETE FROM whatsapp_connections');
    await connectShop(shopA);
    await connectShop(shopB);
    joao = await insertNotifiedClient(shopA);
    connector.reset();
    interpreter.reset();
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('S1 - explicit request for a person', () => {
    it('CA-16.1 (C1): pauses the conversation and tells the client the team is coming', async () => {
      interpreter.next = interpretation({ humanRequested: true });

      await messageUpsert().expect(204);

      expect(connector.sentTexts).toEqual([
        { barbershopId: shopA, phone: PHONE, text: HANDOFF },
      ]);
      expect(await conversationOf(joao)).toMatchObject({
        pause_reason: 'requested',
        paused_at: NOW,
      });
    });

    it('AC 3 (C3): keeps the pause when the hand-off notice cannot be sent', async () => {
      interpreter.next = interpretation({ humanRequested: true });
      connector.failing.add('sendText');

      await messageUpsert().expect(204);

      expect((await conversationOf(joao))?.paused_at).toEqual(NOW);
    });
  });

  describe('S2 - two consecutive misunderstandings', () => {
    it('CA-16.2 (C5): the second misunderstanding hands the conversation over', async () => {
      interpreter.next = interpretation();

      await messageUpsert({ message: { conversation: 'xyz' } }).expect(204);
      expect(textsTo()).toEqual([FALLBACK]);
      expect(await conversationOf(joao)).toMatchObject({
        consecutive_failures: 1,
        paused_at: null,
      });

      await messageUpsert({ message: { conversation: 'abc' } }).expect(204);
      expect(textsTo()).toEqual([FALLBACK, HANDOFF]);
      expect(await conversationOf(joao)).toMatchObject({
        pause_reason: 'not_understood',
      });
    });

    it('AC 8 (C8): two concurrent second misunderstandings send one hand-off notice', async () => {
      await insertConversation(shopA, joao, { failures: 1 });
      interpreter.next = interpretation();

      await Promise.all([
        messageUpsert({ message: { conversation: 'xyz' } }).expect(204),
        messageUpsert({ message: { conversation: 'abc' } }).expect(204),
      ]);

      expect(textsTo()).toEqual([HANDOFF]);
      expect(await conversationOf(joao)).toMatchObject({
        pause_reason: 'not_understood',
      });
    });
  });

  describe('S3 - paused conversation', () => {
    it('CA-16.3 (C9): the bot neither interprets nor answers a paused conversation', async () => {
      await insertConversation(shopA, joao, { pausedAgo: HOUR_MS });
      interpreter.next = interpretation({ topics: ['address'] });

      await messageUpsert({ message: { conversation: 'oi?' } }).expect(204);

      expect(interpreter.inputs).toHaveLength(0);
      expect(connector.sentTexts).toHaveLength(0);
    });

    it.each<[string, { fromMe?: boolean; message: Record<string, unknown> }]>([
      ['a client text', { message: { conversation: 'oi?' } }],
      ['a client audio', { message: { audioMessage: {} } }],
      [
        'a team message',
        { fromMe: true, message: { conversation: 'oi, aqui é o Zé' } },
      ],
    ])(
      'CA-16.5 (C10): %s counts as activity of the paused conversation',
      async (_case, payload) => {
        await insertConversation(shopA, joao, { pausedAgo: HOUR_MS });

        await messageUpsert(payload).expect(204);

        expect((await conversationOf(joao))?.last_activity_at).toEqual(NOW);
        expect(connector.sentTexts).toHaveLength(0);
      },
    );

    it('AC 11 (C11): a team message outside a pause creates and changes nothing', async () => {
      await insertConversation(shopA, joao, { lastActivityAgo: HOUR_MS });
      const before = await conversationOf(joao);

      await messageUpsert({ fromMe: true, remoteJid: NEW_JID }).expect(204);
      await messageUpsert({ fromMe: true }).expect(204);

      const clients = await dataSource.query<unknown[]>(
        'SELECT 1 FROM clients WHERE phone = $1',
        ['+5511933332222'],
      );
      expect(clients).toHaveLength(0);
      const conversations = await dataSource.query<unknown[]>(
        'SELECT 1 FROM whatsapp_conversations',
      );
      expect(conversations).toHaveLength(1);
      expect(await conversationOf(joao)).toEqual(before);
      expect(connector.sentTexts).toHaveLength(0);
    });

    it('RN-26 (C12): a pause in one barbershop does not silence the same phone in another', async () => {
      await insertNotifiedClient(shopB);
      await insertConversation(shopA, joao, { pausedAgo: HOUR_MS });
      interpreter.next = interpretation({ topics: ['address'] });

      await messageUpsert({ instance: shopB }).expect(204);
      await messageUpsert({ instance: shopA }).expect(204);

      expect(textsTo(shopB)).toEqual([
        'A Barbearia B ainda não informou o endereço.',
      ]);
      expect(textsTo(shopA)).toEqual([]);
    });
  });

  describe('S4 - Owner resumes the bot', () => {
    it('CA-16.4 (C13): the Owner resumes a paused conversation and the bot answers again', async () => {
      await insertConversation(shopA, joao, {
        pausedAgo: HOUR_MS,
        failures: 2,
      });

      const response = await resume(joao).expect(204);

      expect(response.text).toBe('');
      expect(await conversationOf(joao)).toMatchObject({
        paused_at: null,
        pause_reason: null,
        consecutive_failures: 0,
      });
      interpreter.next = interpretation({ topics: ['address'] });
      await messageUpsert({ message: { conversation: 'onde fica?' } }).expect(
        204,
      );
      expect(textsTo()).toEqual([ADDRESS_REPLY]);
    });

    it('AC 14 (C14): resuming an active or missing conversation changes nothing', async () => {
      await insertConversation(shopA, joao, { failures: 1 });
      const before = await conversationOf(joao);
      const ana = await insertNotifiedClient(shopA, 'Ana', ANA_PHONE);

      await resume(joao).expect(204);
      await resume(ana).expect(204);

      expect(await conversationOf(joao)).toEqual(before);
      expect(await conversationOf(ana)).toBeUndefined();
    });

    it('RN-26 (C15): resuming an unknown client or one of another barbershop answers 404', async () => {
      const other = await insertNotifiedClient(shopB);
      await insertConversation(shopB, other, { pausedAgo: HOUR_MS });

      await resume(randomUUID()).expect(404, CLIENT_NOT_FOUND);
      await resume(other).expect(404, CLIENT_NOT_FOUND);

      expect((await conversationOf(other, shopB))?.paused_at).not.toBeNull();
    });

    it('AC 16 (C16): a client id that is not a uuid answers 400', async () => {
      await resume('abc').expect(400);
    });

    it.each<[string, () => request.Test]>([
      ['GET waiting-human', () => listWaiting(barberA)],
      ['POST resume', () => resume(joao, barberA)],
    ])('AD-007 (C17): a barber gets 403 on %s', async (_case, call) => {
      await insertConversation(shopA, joao, { pausedAgo: HOUR_MS });

      await call().expect(403, FORBIDDEN);

      expect((await conversationOf(joao))?.paused_at).not.toBeNull();
    });

    it.each<[string, () => request.Test]>([
      ['GET waiting-human', () => listWaiting(null)],
      ['POST resume', () => resume(joao, null)],
    ])('AD-007 (C17): %s without a session gets 401', async (_case, call) => {
      await insertConversation(shopA, joao, { pausedAgo: HOUR_MS });

      await call().expect(401);

      expect((await conversationOf(joao))?.paused_at).not.toBeNull();
    });
  });

  describe('S5 - automatic resume', () => {
    it.each<[string, number, number, boolean]>([
      [
        '11h59',
        11 * HOUR_MS + 59 * MINUTE_MS,
        11 * HOUR_MS + 59 * MINUTE_MS,
        false,
      ],
      ['12h00', 12 * HOUR_MS, 12 * HOUR_MS, true],
      ['12h01', 12 * HOUR_MS + MINUTE_MS, 12 * HOUR_MS + MINUTE_MS, true],
      ['13h with activity 11h ago', 13 * HOUR_MS, 11 * HOUR_MS, false],
    ])(
      'CA-16.5 (C18): a pause %s old (paused %i ms ago, last activity %i ms ago) answers: %s',
      async (_case, pausedAgo, lastActivityAgo, answered) => {
        await insertConversation(shopA, joao, {
          pausedAgo,
          lastActivityAgo,
          failures: 2,
        });
        interpreter.next = interpretation({ topics: ['address'] });

        await messageUpsert({ message: { conversation: 'onde fica?' } }).expect(
          204,
        );

        const row = await conversationOf(joao);
        if (answered) {
          expect(textsTo()).toEqual([ADDRESS_REPLY]);
          expect(row).toMatchObject({
            paused_at: null,
            consecutive_failures: 0,
          });
        } else {
          expect(textsTo()).toEqual([]);
          expect(row?.paused_at).toEqual(ago(pausedAgo));
        }
      },
    );
  });

  describe('S6 - conversations waiting for a human', () => {
    it('CA-16.6 (C21): lists the paused conversations, oldest first', async () => {
      const ana = await insertNotifiedClient(shopA, 'Ana', ANA_PHONE);
      await insertConversation(shopA, ana, {
        pausedAgo: 3 * HOUR_MS,
        reason: 'not_understood',
      });
      await insertConversation(shopA, joao, {
        pausedAgo: HOUR_MS,
        lastActivityAgo: 30 * MINUTE_MS,
      });

      const response = await listWaiting().expect(200);

      expect(response.body).toEqual({
        conversations: [
          {
            clientId: ana,
            clientName: 'Ana',
            phone: ANA_PHONE,
            reason: 'not_understood',
            pausedAt: '2026-09-29T12:00:00.000Z',
            lastActivityAt: '2026-09-29T12:00:00.000Z',
          },
          {
            clientId: joao,
            clientName: 'João Silva',
            phone: PHONE,
            reason: 'requested',
            pausedAt: '2026-09-29T14:00:00.000Z',
            lastActivityAt: '2026-09-29T14:30:00.000Z',
          },
        ],
      });
    });

    it.each<[string, () => Promise<void>]>([
      [
        'an active conversation with failures',
        () => insertConversation(shopA, joao, { failures: 1 }),
      ],
      [
        'a conversation the Owner resumed',
        async () => {
          await insertConversation(shopA, joao, { pausedAgo: HOUR_MS });
          await resume(joao).expect(204);
        },
      ],
      [
        'a pause expired 12h01 ago',
        () =>
          insertConversation(shopA, joao, {
            pausedAgo: 12 * HOUR_MS + MINUTE_MS,
          }),
      ],
      [
        'a paused conversation of another barbershop',
        async () => {
          const other = await insertNotifiedClient(shopB);
          await insertConversation(shopB, other, { pausedAgo: HOUR_MS });
        },
      ],
    ])('RN-26 (C22): leaves out %s', async (_case, arrange) => {
      await arrange();

      await listWaiting().expect(200, { conversations: [] });
    });

    it('CA-16.6 (C23): answers an empty list when nobody is waiting', async () => {
      await listWaiting().expect(200, { conversations: [] });
    });

    it('RN-26: the Owner of B sees only the conversations of B', async () => {
      await insertConversation(shopA, joao, { pausedAgo: HOUR_MS });

      await listWaiting(ownerB).expect(200, { conversations: [] });
    });
  });

  describe('S7 - observability and idempotency', () => {
    it('AC 25 (C24): counts hand-offs by reason and the hand-off replies', async () => {
      const requested = 'whatsapp_handoffs_total{reason="requested"}';
      const notUnderstood = 'whatsapp_handoffs_total{reason="not_understood"}';
      const handoffReplies = 'whatsapp_replies_total{kind="handoff"}';
      const before = {
        requested: await metricValue(requested),
        notUnderstood: await metricValue(notUnderstood),
        replies: await metricValue(handoffReplies),
      };

      interpreter.next = interpretation({ humanRequested: true });
      await messageUpsert().expect(204);
      expect(await metricValue(requested)).toBe(before.requested + 1);
      expect(await metricValue(handoffReplies)).toBe(before.replies + 1);

      const ana = await insertNotifiedClient(shopA, 'Ana', ANA_PHONE);
      await insertConversation(shopA, ana, { failures: 1 });
      interpreter.next = interpretation();
      await messageUpsert({
        remoteJid: '5511955554444@s.whatsapp.net',
      }).expect(204);
      expect(await metricValue(notUnderstood)).toBe(before.notUnderstood + 1);
      expect(await metricValue(handoffReplies)).toBe(before.replies + 2);

      const lines = (await metricsText())
        .split('\n')
        .filter(
          (line) =>
            line.startsWith('whatsapp_handoffs_total{') ||
            line.startsWith('whatsapp_replies_total{'),
        );
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toMatch(
          /^whatsapp_(handoffs_total\{reason|replies_total\{kind)="[a-z_]+"\} \d+$/,
        );
      }
    });

    it('AC 26 (C25): counts resumes by the Owner and by timeout', async () => {
      const owner = 'whatsapp_bot_resumes_total{trigger="owner"}';
      const timeout = 'whatsapp_bot_resumes_total{trigger="timeout"}';
      const before = {
        owner: await metricValue(owner),
        timeout: await metricValue(timeout),
      };

      await insertConversation(shopA, joao, { pausedAgo: HOUR_MS });
      await resume(joao).expect(204);
      expect(await metricValue(owner)).toBe(before.owner + 1);

      await resume(joao).expect(204);
      expect(await metricValue(owner)).toBe(before.owner + 1);
      expect(await metricValue(timeout)).toBe(before.timeout);

      const ana = await insertNotifiedClient(shopA, 'Ana', ANA_PHONE);
      await insertConversation(shopA, ana, {
        pausedAgo: 12 * HOUR_MS + MINUTE_MS,
      });
      interpreter.next = interpretation({ topics: ['address'] });
      await messageUpsert({
        remoteJid: '5511955554444@s.whatsapp.net',
      }).expect(204);
      expect(await metricValue(timeout)).toBe(before.timeout + 1);
      expect(await metricValue(owner)).toBe(before.owner + 1);
    });

    it('door 2 (C29): creates the conversation on the first text and ignores a redelivery', async () => {
      interpreter.next = interpretation({ topics: ['address'] });
      await messageUpsert({ message: { conversation: 'onde fica?' } }).expect(
        204,
      );
      expect(await conversationOf(joao)).toEqual({
        consecutive_failures: 0,
        paused_at: null,
        pause_reason: null,
        last_activity_at: NOW,
      });

      const id = randomUUID();
      interpreter.next = interpretation({ humanRequested: true });
      await messageUpsert({ id }).expect(204);
      const afterHandoff = await conversationOf(joao);
      const sent = connector.sentTexts.length;

      await messageUpsert({ id }).expect(204);

      expect(connector.sentTexts).toHaveLength(sent);
      expect(await conversationOf(joao)).toEqual(afterHandoff);
    });
  });
});

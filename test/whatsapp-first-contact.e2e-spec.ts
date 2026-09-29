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
import { WHATSAPP_CONNECTOR } from '../src/usecases/ports/whatsapp-connector.port';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { FakeWhatsAppConnector } from '../src/usecases/testing/fake-whatsapp-connector';
import { FixedClock } from '../src/usecases/testing/fixed-clock';
import { signupOwner } from './support/account-flows';
import { truncateAccountTables } from './support/truncate-account-tables';

const NOW = new Date('2026-09-29T15:00:00.000Z');
const NOW_SECONDS = 1790694000;
const PHONE = '+5511987654321';
const JID = '5511987654321@s.whatsapp.net';

interface ClientRow {
  id: string;
  barbershop_id: string;
  name: string;
  phone: string;
  privacy_notice_sent_at: Date | null;
}

describe('WhatsApp first contact (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let connector: FakeWhatsAppConnector;
  let webhookSecret: string;
  let policyUrl: string;

  let shopA: string;
  let shopB: string;
  let ownerToken: string;

  function noticeFor(barbershopName: string): string {
    return `Olá! Aqui é o assistente virtual da ${barbershopName}. O atendimento é feito por inteligência artificial, e usamos seu nome e telefone para agendar seus horários. Política de privacidade: ${policyUrl}`;
  }

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

  async function clientsOf(
    barbershopId: string,
    phone = PHONE,
  ): Promise<ClientRow[]> {
    return dataSource.query<ClientRow[]>(
      `SELECT id, barbershop_id, name, phone, privacy_notice_sent_at
         FROM clients WHERE barbershop_id = $1 AND phone = $2`,
      [barbershopId, phone],
    );
  }

  async function insertPanelClient(
    barbershopId: string,
    name: string,
    phone: string,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [randomUUID(), barbershopId, name, phone],
    );
  }

  function messageUpsert({
    instance = shopA,
    remoteJid = JID,
    fromMe = false,
    pushName = 'João Silva',
    messageTimestamp = NOW_SECONDS,
  }: {
    instance?: string;
    remoteJid?: string;
    fromMe?: boolean;
    pushName?: string;
    messageTimestamp?: number;
  } = {}) {
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp/evolution')
      .set('authorization', `Bearer ${webhookSecret}`)
      .send({
        event: 'messages.upsert',
        instance,
        data: {
          key: { remoteJid, fromMe, id: randomUUID() },
          pushName,
          message: { conversation: 'Oi, tudo bem?' },
          messageType: 'conversation',
          messageTimestamp,
          instanceId: randomUUID(),
          source: 'android',
        },
        apikey: 'instance-token',
      });
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
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(new FakeEmailSender())
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(NOW))
      .overrideProvider(WHATSAPP_CONNECTOR)
      .useValue(connector)
      .compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>();
    await app.init();
    dataSource = app.get(DataSource);
    const config = app.get(ConfigService);
    webhookSecret = config.getOrThrow<string>('WHATSAPP_WEBHOOK_SECRET');
    policyUrl = config.getOrThrow<string>('PRIVACY_POLICY_URL');

    await truncateAccountTables(dataSource);
    ({ accessToken: ownerToken } = await signupOwner(app, 'dono@a.com'));
    await signupOwner(app, 'dono@b.com', 'Barbearia B');
    shopA = await barbershopOf('dono@a.com');
    shopB = await barbershopOf('dono@b.com');
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM appointments');
    await dataSource.query('DELETE FROM clients');
    await dataSource.query('DELETE FROM whatsapp_connections');
    await connectShop(shopA);
    connector.reset();
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('S1 - client created on the first contact', () => {
    it('CA-14.1 (C1): creates the client with the phone and the profile name', async () => {
      await messageUpsert().expect(204);

      const rows = await clientsOf(shopA);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ phone: PHONE, name: 'João Silva' });
      const search = await request(app.getHttpServer())
        .get('/clients')
        .query({ q: '987654321' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(JSON.stringify(search.body)).toContain('João Silva');
      expect(JSON.stringify(search.body)).toContain(PHONE);
    });

    it('CA-14.1 (C3): matches a panel client through the ninth digit and keeps its name', async () => {
      await insertPanelClient(shopA, 'Carlos', '+5531988887777');

      await messageUpsert({
        remoteJid: '553188887777@s.whatsapp.net',
        pushName: 'Carlão',
      }).expect(204);

      const rows = await clientsOf(shopA, '+5531988887777');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Carlos');
    });

    it('CA-14.1 (C5): two concurrent first messages create a single client', async () => {
      const responses = await Promise.all([messageUpsert(), messageUpsert()]);

      expect(responses.map(({ status }) => status)).toEqual([204, 204]);
      expect(await clientsOf(shopA)).toHaveLength(1);
    });

    it('CA-14.1 (C6): the same phone becomes one client in each barbershop (RN-26)', async () => {
      await connectShop(shopB);

      await messageUpsert({ instance: shopA }).expect(204);
      await messageUpsert({ instance: shopB }).expect(204);

      const [a] = await clientsOf(shopA);
      const [b] = await clientsOf(shopB);
      expect(a.barbershop_id).toBe(shopA);
      expect(b.barbershop_id).toBe(shopB);
      expect(a.id).not.toBe(b.id);
      expect(connector.sentTexts).toEqual([
        {
          barbershopId: shopA,
          phone: PHONE,
          text: noticeFor('Barbearia do Zé'),
        },
        { barbershopId: shopB, phone: PHONE, text: noticeFor('Barbearia B') },
      ]);
    });
  });

  describe('S2 - privacy notice once', () => {
    it('CA-14.2 (C7): sends the privacy notice on the first message', async () => {
      await messageUpsert().expect(204);

      expect(connector.sentTexts).toEqual([
        {
          barbershopId: shopA,
          phone: PHONE,
          text: `Olá! Aqui é o assistente virtual da Barbearia do Zé. O atendimento é feito por inteligência artificial, e usamos seu nome e telefone para agendar seus horários. Política de privacidade: ${policyUrl}`,
        },
      ]);
    });

    it('CA-14.2 (C8): records when the notice was sent', async () => {
      await messageUpsert().expect(204);

      const [row] = await clientsOf(shopA);
      expect(row.privacy_notice_sent_at).toEqual(NOW);
    });

    it('CA-14.3 (C9): does not repeat the notice on the next message', async () => {
      await messageUpsert().expect(204);
      await messageUpsert().expect(204);

      expect(connector.sentTexts).toHaveLength(1);
    });

    it('CA-14.2 (C10): a panel client gets the notice on its first message', async () => {
      await insertPanelClient(shopA, 'Carlos', PHONE);

      await messageUpsert().expect(204);

      expect(connector.sentTexts).toEqual([
        {
          barbershopId: shopA,
          phone: PHONE,
          text: noticeFor('Barbearia do Zé'),
        },
      ]);
    });

    it('CA-14.3 (C11): concurrent messages send a single notice', async () => {
      await insertPanelClient(shopA, 'Carlos', PHONE);

      await Promise.all([messageUpsert(), messageUpsert()]);

      expect(connector.sentTexts).toHaveLength(1);
    });

    it('CA-14.3 (C11): a redelivered event sends a single notice', async () => {
      const payload = {
        event: 'messages.upsert',
        instance: shopA,
        data: {
          key: { remoteJid: JID, fromMe: false, id: 'MESSAGE-1' },
          pushName: 'João Silva',
          messageTimestamp: NOW_SECONDS,
        },
      };
      for (let delivery = 0; delivery < 2; delivery += 1) {
        await request(app.getHttpServer())
          .post('/webhooks/whatsapp/evolution')
          .set('authorization', `Bearer ${webhookSecret}`)
          .send(payload)
          .expect(204);
      }

      expect(connector.sentTexts).toHaveLength(1);
    });

    it('CA-14.2 (C12): a failed send answers 204 and the next message tries again', async () => {
      connector.failing.add('sendText');

      await messageUpsert().expect(204);

      const [failed] = await clientsOf(shopA);
      expect(failed.privacy_notice_sent_at).toBeNull();
      expect(connector.sentTexts).toEqual([]);

      connector.failing.clear();
      await messageUpsert().expect(204);

      const [sent] = await clientsOf(shopA);
      expect(sent.privacy_notice_sent_at).toEqual(NOW);
      expect(connector.sentTexts).toHaveLength(1);
    });

    it('CA-14.2 (C14): stores the notice in a nullable timestamptz column without default', async () => {
      const [column] = await dataSource.query<
        {
          data_type: string;
          is_nullable: string;
          column_default: string | null;
        }[]
      >(
        `SELECT data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_name = 'clients' AND column_name = 'privacy_notice_sent_at'`,
      );
      expect(column).toEqual({
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
        column_default: null,
      });

      await insertPanelClient(shopA, 'Carlos', PHONE);
      const [row] = await clientsOf(shopA);
      expect(row.privacy_notice_sent_at).toBeNull();
    });
  });

  describe('S3 - ignored messages', () => {
    it.each([
      ['sent by the barbershop number', { fromMe: true }],
      ['from a group', { remoteJid: '120363000000000000@g.us' }],
      ['sent 10 minutes ago', { messageTimestamp: NOW_SECONDS - 600 }],
    ])('CA-14.1 (C16): ignores a message %s', async (_case, overrides) => {
      await messageUpsert(overrides).expect(204);

      expect(
        await dataSource.query(
          'SELECT id FROM clients WHERE barbershop_id = $1',
          [shopA],
        ),
      ).toEqual([]);
      expect(connector.sentTexts).toEqual([]);
      expect(connector.calls).toEqual([]);
    });

    it('CA-14.1 (C17): ignores a message to a barbershop that never connected', async () => {
      await messageUpsert({ instance: shopB }).expect(204);

      expect(await clientsOf(shopB)).toEqual([]);
      expect(connector.calls).toEqual([]);
    });
  });

  describe('S4 - operation', () => {
    it('CA-14.2 (C21): never logs the phone, the profile name or the notice', async () => {
      const spies = (['log', 'error', 'warn', 'debug', 'verbose'] as const).map(
        (method) =>
          jest
            .spyOn(Logger.prototype, method)
            .mockImplementation(() => undefined),
      );
      try {
        await messageUpsert().expect(204);
        await dataSource.query('DELETE FROM clients');
        connector.failing.add('sendText');
        await messageUpsert().expect(204);

        const logged = JSON.stringify(
          spies.flatMap((spy) => spy.mock.calls as unknown[]),
        );
        expect(spies[1]).toHaveBeenCalled();
        expect(logged).not.toContain('987654321');
        expect(logged).not.toContain('João Silva');
        expect(logged).not.toContain('inteligência artificial');
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });

    it('CA-14.2 (C22): counts created clients and notices by outcome only', async () => {
      const created = await metricValue('whatsapp_clients_created_total');
      const sent = await metricValue(
        'whatsapp_privacy_notices_total{outcome="sent"}',
      );
      const failed = await metricValue(
        'whatsapp_privacy_notices_total{outcome="failed"}',
      );

      await messageUpsert().expect(204);
      await dataSource.query('DELETE FROM clients');
      connector.failing.add('sendText');
      await messageUpsert().expect(204);

      expect(await metricValue('whatsapp_clients_created_total')).toBe(
        created + 2,
      );
      expect(
        await metricValue('whatsapp_privacy_notices_total{outcome="sent"}'),
      ).toBe(sent + 1);
      expect(
        await metricValue('whatsapp_privacy_notices_total{outcome="failed"}'),
      ).toBe(failed + 1);

      const response = await request(app.getHttpServer()).get('/metrics');
      const lines = response.text
        .split('\n')
        .filter((line) =>
          /^whatsapp_(clients_created|privacy_notices)_total/.test(line),
        );
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toMatch(
          /^whatsapp_(clients_created_total|privacy_notices_total\{outcome="(sent|failed)"\}) \d+$/,
        );
      }
    });
  });
});

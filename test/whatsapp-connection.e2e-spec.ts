import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
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
import { createBarber, signupOwner } from './support/account-flows';
import { truncateAccountTables } from './support/truncate-account-tables';

// Tuesday 2026-09-29, 12:00 in São Paulo (UTC-3).
const NOW = new Date('2026-09-29T15:00:00.000Z');
const EARLIER = new Date('2026-09-28T10:00:00.000Z');
const PREVIOUS_DROP = new Date('2026-09-20T08:00:00.000Z');
const DROP_SUBJECT = 'O WhatsApp da barbearia desconectou';
const ALREADY_CONNECTED = { message: 'O WhatsApp já está conectado.' };
const CONNECTOR_DOWN = {
  message: 'Não foi possível falar com o WhatsApp. Tente de novo em instantes.',
};
const ACCESS_DENIED = { message: 'Acesso negado.' };

type Status = 'disconnected' | 'connecting' | 'connected';

interface ConnectionRow {
  status: Status;
  disconnected_at: Date | null;
  updated_at: Date;
}

describe('WhatsApp connection (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let connector: FakeWhatsAppConnector;
  let webhookSecret: string;

  let shopA: string;
  let shopB: string;
  let ownerToken: string;
  let ownerBToken: string;
  let barberToken: string;

  async function barbershopOf(email: string): Promise<string> {
    const [row] = await dataSource.query<{ barbershop_id: string }[]>(
      'SELECT barbershop_id FROM users WHERE email = $1',
      [email],
    );
    return row.barbershop_id;
  }

  async function setConnection(
    barbershopId: string,
    status: Status,
    disconnectedAt: Date | null = null,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO whatsapp_connections (barbershop_id, status, disconnected_at, updated_at)
       VALUES ($1, $2, $3, $4)`,
      [barbershopId, status, disconnectedAt, EARLIER],
    );
  }

  async function connectionOf(
    barbershopId: string,
  ): Promise<ConnectionRow | undefined> {
    const [row] = await dataSource.query<ConnectionRow[]>(
      'SELECT status, disconnected_at, updated_at FROM whatsapp_connections WHERE barbershop_id = $1',
      [barbershopId],
    );
    return row;
  }

  function connect(token = ownerToken) {
    return request(app.getHttpServer())
      .post('/whatsapp/connection')
      .set('Authorization', `Bearer ${token}`);
  }

  function status(token = ownerToken) {
    return request(app.getHttpServer())
      .get('/whatsapp/connection')
      .set('Authorization', `Bearer ${token}`);
  }

  function webhook(
    body: Record<string, unknown>,
    authorization: string | null = `Bearer ${webhookSecret}`,
  ) {
    const call = request(app.getHttpServer()).post(
      '/webhooks/whatsapp/evolution',
    );
    if (authorization !== null) call.set('authorization', authorization);
    return call.send(body);
  }

  function connectionUpdate(barbershopId: string, state: string) {
    return webhook({
      event: 'connection.update',
      instance: barbershopId,
      data: { instance: barbershopId, state, statusReason: 200 },
      apikey: 'instance-token',
    });
  }

  function dropEmails(): string[] {
    return emailSender.sent
      .filter((message) => message.subject === DROP_SUBJECT)
      .map((message) => message.to)
      .sort();
  }

  async function metricValue(name: string): Promise<number> {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);
    const line = response.text
      .split('\n')
      .find((item) => item.startsWith(`${name} `));
    return line ? Number(line.split(' ')[1]) : 0;
  }

  beforeAll(async () => {
    emailSender = new FakeEmailSender();
    connector = new FakeWhatsAppConnector();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
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

    await truncateAccountTables(dataSource);
    ({ accessToken: ownerToken } = await signupOwner(app, 'dono@a.com'));
    barberToken = await createBarber(
      app,
      emailSender,
      config.getOrThrow<string>('APP_WEB_URL'),
      ownerToken,
      'bruno@a.com',
      'Bruno',
    );
    ({ accessToken: ownerBToken } = await signupOwner(
      app,
      'dono@b.com',
      'Barbearia B',
    ));
    shopA = await barbershopOf('dono@a.com');
    shopB = await barbershopOf('dono@b.com');
    // A second Owner of A, straight in the table: signup creates one per shop.
    await dataSource.query(
      `INSERT INTO users (id, barbershop_id, name, email, phone, password_hash, role, created_at)
       SELECT gen_random_uuid(), barbershop_id, 'Maria Souza', 'socia@a.com', phone, password_hash, 'owner', now()
       FROM users WHERE email = 'dono@a.com'`,
    );
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM whatsapp_connections');
    connector.reset();
    emailSender.sent.length = 0;
    emailSender.failure = null;
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await app.close();
  });

  describe('S1 - connect by QR code', () => {
    it('CA-13.1 (C1): the Owner gets a PNG QR code and the instance is ensured first', async () => {
      const response = await connect().expect(200);

      expect(Object.keys(response.body as object).sort()).toEqual([
        'qrCode',
        'status',
      ]);
      const body = response.body as { status: string; qrCode: string };
      expect(body.status).toBe('connecting');
      expect(body.qrCode.startsWith('data:image/png;base64,')).toBe(true);
      expect(connector.calls).toEqual([
        { operation: 'ensureInstance', barbershopId: shopA },
        { operation: 'requestQrCode', barbershopId: shopA },
      ]);
    });

    it('CA-13.1 (C3): asking again returns the refreshed QR code', async () => {
      connector.qrCodes = [
        'data:image/png;base64,FIRST',
        'data:image/png;base64,SECOND',
      ];

      const first = await connect().expect(200);
      const second = await connect().expect(200);

      expect((first.body as { qrCode: string }).qrCode).toBe(
        'data:image/png;base64,FIRST',
      );
      expect((second.body as { qrCode: string }).qrCode).toBe(
        'data:image/png;base64,SECOND',
      );
    });

    it('CA-13.1 (C4): stores the connection as connecting and never the QR code', async () => {
      await connect().expect(200);

      expect(await connectionOf(shopA)).toMatchObject({
        status: 'connecting',
      });
      const columns = await dataSource.query<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'whatsapp_connections' ORDER BY column_name`,
      );
      expect(columns.map(({ column_name }) => column_name)).toEqual([
        'barbershop_id',
        'disconnected_at',
        'status',
        'updated_at',
      ]);
    });

    it('CA-13.1 (C5): a connected number answers 409 without asking for a QR code', async () => {
      await setConnection(shopA, 'connected');

      const response = await connect().expect(409);

      expect(response.body).toEqual(ALREADY_CONNECTED);
      expect(
        connector.calls.some(({ operation }) => operation === 'requestQrCode'),
      ).toBe(false);
    });

    it('CA-13.1 (C6): a failing connector answers 502 and keeps the stored state', async () => {
      await setConnection(shopA, 'connecting');
      connector.failing.add('requestQrCode');

      const response = await connect().expect(502);

      expect(response.body).toEqual(CONNECTOR_DOWN);
      expect(await connectionOf(shopA)).toEqual({
        status: 'connecting',
        disconnected_at: null,
        updated_at: EARLIER,
      });
    });
  });

  describe('S2 - connection status', () => {
    it('CA-13.2 (C8): answers exactly status and disconnectedAt', async () => {
      await setConnection(shopA, 'connected');
      connector.state = 'open';

      const response = await status().expect(200);

      expect(Object.keys(response.body as object).sort()).toEqual([
        'disconnectedAt',
        'status',
      ]);
    });

    it('CA-13.2 (C9): a barbershop that never connected is disconnected, without calling the connector', async () => {
      const response = await status().expect(200);

      expect(response.body).toEqual({
        status: 'disconnected',
        disconnectedAt: null,
      });
      expect(connector.calls).toEqual([]);
    });

    it('CA-13.2 (C11): the live open state turns connecting into connected', async () => {
      await setConnection(shopA, 'connecting', PREVIOUS_DROP);
      connector.state = 'open';

      const response = await status().expect(200);

      expect(response.body).toEqual({
        status: 'connected',
        disconnectedAt: null,
      });
      expect(await connectionOf(shopA)).toMatchObject({
        status: 'connected',
        disconnected_at: null,
      });
    });

    it('CA-13.2 (C12): a silent connector leaves the stored state on screen', async () => {
      await setConnection(shopA, 'connected');
      connector.failing.add('getState');

      const response = await status().expect(200);

      expect(response.body).toEqual({
        status: 'connected',
        disconnectedAt: null,
      });
    });
  });

  describe('S3 - drop alert', () => {
    it('CA-13.3 (C14): a drop is stored and e-mailed to every Owner, not to the Barber', async () => {
      await setConnection(shopA, 'connected');

      await connectionUpdate(shopA, 'close').expect(204);

      expect(await connectionOf(shopA)).toMatchObject({
        status: 'disconnected',
        disconnected_at: NOW,
      });
      expect(dropEmails()).toEqual(['dono@a.com', 'socia@a.com']);
    });

    it('CA-13.3 (C16): the panel shows the drop until the number reconnects', async () => {
      await setConnection(shopA, 'connected');
      await connectionUpdate(shopA, 'close').expect(204);
      connector.failing.add('getState');

      const dropped = await status().expect(200);
      expect(dropped.body).toEqual({
        status: 'disconnected',
        disconnectedAt: '2026-09-29T15:00:00.000Z',
      });

      await connectionUpdate(shopA, 'open').expect(204);
      const reconnected = await status().expect(200);
      expect(reconnected.body).toEqual({
        status: 'connected',
        disconnectedAt: null,
      });
    });

    it('CA-13.3 (C17): two concurrent drop webhooks send a single e-mail per Owner', async () => {
      await setConnection(shopA, 'connected');

      const responses = await Promise.all([
        connectionUpdate(shopA, 'close'),
        connectionUpdate(shopA, 'close'),
      ]);

      expect(responses.map(({ status: code }) => code)).toEqual([204, 204]);
      expect(dropEmails()).toEqual(['dono@a.com', 'socia@a.com']);
    });

    it('CA-13.3 (C18): a drop seen by the webhook and the panel at once sends a single e-mail per Owner', async () => {
      await setConnection(shopA, 'connected');
      connector.state = 'close';

      await Promise.all([
        connectionUpdate(shopA, 'close').expect(204),
        status().expect(200),
      ]);

      expect(dropEmails()).toEqual(['dono@a.com', 'socia@a.com']);
    });

    it('CA-13.3 (C19): a close on a disconnected number neither alerts nor moves disconnectedAt', async () => {
      await setConnection(shopA, 'disconnected', PREVIOUS_DROP);

      await connectionUpdate(shopA, 'close').expect(204);

      expect(emailSender.sent).toEqual([]);
      expect(await connectionOf(shopA)).toMatchObject({
        status: 'disconnected',
        disconnected_at: PREVIOUS_DROP,
      });
    });

    it('CA-13.3 (C20): a failing e-mail still answers 204 and keeps the drop', async () => {
      await setConnection(shopA, 'connected');
      emailSender.failure = new Error('smtp down for dono@a.com');

      await connectionUpdate(shopA, 'close').expect(204);

      expect(await connectionOf(shopA)).toMatchObject({
        status: 'disconnected',
        disconnected_at: NOW,
      });
    });
  });

  describe('S4 - Evolution webhook', () => {
    it('CA-13.3 (C22): connection.update open marks the number connected', async () => {
      await setConnection(shopA, 'connecting');

      const response = await connectionUpdate(shopA, 'open').expect(204);

      expect(response.text).toBe('');
      connector.state = 'open';
      const current = await status().expect(200);
      expect((current.body as { status: string }).status).toBe('connected');
    });

    it.each([
      ['without authorization', null],
      ['with another secret', `Bearer ${'x'.repeat(32)}`],
      ['without the Bearer prefix', 'SECRET'],
    ])(
      'CA-13.3 (C23): answers 401 %s and changes nothing',
      async (_, authorization) => {
        await setConnection(shopA, 'connected');

        await webhook(
          {
            event: 'connection.update',
            instance: shopA,
            data: { state: 'close' },
          },
          authorization === 'SECRET' ? webhookSecret : authorization,
        ).expect(401);

        expect(await connectionOf(shopA)).toMatchObject({
          status: 'connected',
        });
        expect(emailSender.sent).toEqual([]);
      },
    );

    it.each([
      ['without event', { instance: 'a', data: {} }],
      ['without instance', { event: 'connection.update', data: {} }],
      ['with a numeric instance', { event: 'connection.update', instance: 42 }],
    ])('CA-13.3 (C24): answers 400 %s', async (_, body) => {
      await webhook(body).expect(400);
    });

    it('CA-13.3 (C25): acknowledges and ignores what it does not handle', async () => {
      await setConnection(shopA, 'connected');
      const ignored = [
        { event: 'messages.upsert', instance: shopA, data: { state: 'close' } },
        {
          event: 'connection.update',
          instance: shopA,
          data: { state: 'pending' },
        },
        {
          event: 'connection.update',
          instance: shopB,
          data: { state: 'open' },
        },
        {
          event: 'connection.update',
          instance: 'not-a-uuid',
          data: { state: 'close' },
        },
      ];

      for (const body of ignored) {
        await webhook(body).expect(204);
      }

      expect(await connectionOf(shopA)).toEqual({
        status: 'connected',
        disconnected_at: null,
        updated_at: EARLIER,
      });
      expect(await connectionOf(shopB)).toBeUndefined();
      expect(emailSender.sent).toEqual([]);
    });

    it('CA-13.3 (C26): refused is handled as close', async () => {
      await setConnection(shopA, 'connecting');
      await connectionUpdate(shopA, 'refused').expect(204);
      expect(await connectionOf(shopA)).toMatchObject({
        status: 'disconnected',
      });
      expect(emailSender.sent).toEqual([]);

      await dataSource.query('DELETE FROM whatsapp_connections');
      await setConnection(shopA, 'connected');
      await connectionUpdate(shopA, 'refused').expect(204);
      expect(await connectionOf(shopA)).toMatchObject({
        status: 'disconnected',
        disconnected_at: NOW,
      });
      expect(dropEmails()).toEqual(['dono@a.com', 'socia@a.com']);
    });
  });

  describe('S5 - permissions, tenant and operation', () => {
    it('CA-13.5 (C29): a Barber gets 403 on both panel routes', async () => {
      const connectResponse = await connect(barberToken).expect(403);
      const statusResponse = await status(barberToken).expect(403);

      expect(connectResponse.body).toEqual(ACCESS_DENIED);
      expect(statusResponse.body).toEqual(ACCESS_DENIED);
    });

    it('CA-13.5 (C30): no session gets 401 on both panel routes', async () => {
      await request(app.getHttpServer())
        .post('/whatsapp/connection')
        .expect(401);
      await request(app.getHttpServer())
        .get('/whatsapp/connection')
        .expect(401);
    });

    it('RN-26 (C31): each barbershop only sees and changes its own connection', async () => {
      await setConnection(shopA, 'connected');

      const shopBStatus = await status(ownerBToken).expect(200);
      expect(shopBStatus.body).toEqual({
        status: 'disconnected',
        disconnectedAt: null,
      });

      await connectionUpdate(shopA, 'close').expect(204);

      expect(await connectionOf(shopA)).toMatchObject({
        status: 'disconnected',
      });
      expect(await connectionOf(shopB)).toBeUndefined();
      expect(dropEmails()).toEqual(['dono@a.com', 'socia@a.com']);
    });

    it('RNF-07 (C33): a drop adds one to whatsapp_disconnections_total, with no barbershop label', async () => {
      await setConnection(shopA, 'connected');
      const before = await metricValue('whatsapp_disconnections_total');

      await connectionUpdate(shopA, 'close').expect(204);

      expect(await metricValue('whatsapp_disconnections_total')).toBe(
        before + 1,
      );
      const metrics = await request(app.getHttpServer()).get('/metrics');
      expect(
        metrics.text
          .split('\n')
          .filter((line) => line.startsWith('whatsapp_'))
          .some((line) => line.includes(shopA)),
      ).toBe(false);
    });

    describe('C35: whatsapp_connections constraints', () => {
      it('rejects an unknown status', async () => {
        await expect(setConnection(shopA, 'foo' as Status)).rejects.toThrow(
          /whatsapp_connections_status_check/,
        );
      });

      it('rejects a second row for the same barbershop', async () => {
        await setConnection(shopA, 'connecting');
        await expect(setConnection(shopA, 'connected')).rejects.toThrow(
          /PK_whatsapp_connections_barbershop_id/,
        );
      });

      it('rejects a null status', async () => {
        await expect(
          dataSource.query(
            `INSERT INTO whatsapp_connections (barbershop_id, status, updated_at) VALUES ($1, NULL, now())`,
            [shopA],
          ),
        ).rejects.toThrow(/null value/);
      });

      it('deletes the connection with its barbershop', async () => {
        const [{ id }] = await dataSource.query<{ id: string }[]>(
          `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
           VALUES (gen_random_uuid(), 'Temporária', 'America/Sao_Paulo', 'trialing', now(), now())
           RETURNING id`,
        );
        await setConnection(id, 'connected');

        await dataSource.query('DELETE FROM barbershops WHERE id = $1', [id]);

        expect(await connectionOf(id)).toBeUndefined();
      });
    });
  });
});

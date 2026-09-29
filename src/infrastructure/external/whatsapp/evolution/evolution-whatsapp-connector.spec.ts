import { Registry } from 'prom-client';
import { WhatsAppConnectorUnavailableError } from '../../../../domain/errors/whatsapp-connector-unavailable.error';
import {
  EvolutionConfig,
  EvolutionWhatsAppConnector,
} from './evolution-whatsapp-connector';

const SHOP = '0b9f7d8e-8a55-4c1c-9d51-6f2f3d1f0a11';
const CONFIG: EvolutionConfig = {
  baseUrl: 'http://evolution.test',
  apiKey: 'evolution-key',
  timeoutMs: 50,
  webhookUrl: 'http://api.test/webhooks/whatsapp/evolution',
  webhookSecret: 's'.repeat(32),
};
const QR = 'data:image/png;base64,iVBORw0KGgo';

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status: number; body?: unknown } | 'network' | 'hang';

function setup(replies: Record<string, Reply>) {
  const requests: Recorded[] = [];
  const fetchFn = ((input: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    const path = input.replace(CONFIG.baseUrl, '');
    requests.push({
      method,
      url: input,
      headers: init.headers as Record<string, string>,
      body: init.body ? (JSON.parse(init.body as string) as unknown) : null,
    });
    const reply = replies[`${method} ${path}`];
    if (!reply) throw new Error(`unexpected ${method} ${path}`);
    if (reply === 'network')
      return Promise.reject(new TypeError('fetch failed'));
    if (reply === 'hang') {
      return new Promise((_, reject) =>
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('timeout', 'TimeoutError')),
        ),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(reply.body ?? {}), { status: reply.status }),
    );
  }) as unknown as typeof fetch;
  const registry = new Registry();
  const connector = new EvolutionWhatsAppConnector(CONFIG, registry, fetchFn);
  return { connector, requests, registry };
}

const STATE_PATH = `GET /instance/connectionState/${SHOP}`;
const CONNECT_PATH = `GET /instance/connect/${SHOP}`;
const WEBHOOK_SET_PATH = `POST /webhook/set/${SHOP}`;
const SEND_TEXT_PATH = `POST /message/sendText/${SHOP}`;
const WEBHOOK = {
  enabled: true,
  url: 'http://api.test/webhooks/whatsapp/evolution',
  byEvents: false,
  events: ['CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
  headers: { authorization: `Bearer ${'s'.repeat(32)}` },
};

describe('EvolutionWhatsAppConnector', () => {
  it('CA-13.4 (C2): creates a missing instance named after the barbershop, with the webhook and without taking over the phone', async () => {
    const { connector, requests } = setup({
      [STATE_PATH]: { status: 404, body: { status: 404 } },
      'POST /instance/create': { status: 201, body: { instance: {} } },
    });

    await connector.ensureInstance(SHOP);

    const create = requests.find((request) => request.method === 'POST')!;
    expect(create.url).toBe('http://evolution.test/instance/create');
    expect(create.headers.apikey).toBe('evolution-key');
    expect(create.body).toMatchObject({
      instanceName: SHOP,
      integration: 'WHATSAPP-BAILEYS',
      alwaysOnline: false,
      readMessages: false,
      webhook: {
        enabled: true,
        url: 'http://api.test/webhooks/whatsapp/evolution',
        byEvents: false,
        events: ['CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
        headers: { authorization: `Bearer ${'s'.repeat(32)}` },
      },
    });
    for (const request of requests) {
      expect(request.headers.apikey).toBe('evolution-key');
    }
  });

  it('CA-13.1 (C3): reuses an existing instance and returns the base64 QR code of connect', async () => {
    const { connector, requests } = setup({
      [STATE_PATH]: { status: 200, body: { instance: { state: 'close' } } },
      [WEBHOOK_SET_PATH]: { status: 201, body: { webhook: {} } },
      [CONNECT_PATH]: {
        status: 200,
        body: { pairingCode: null, code: '2@abc', base64: QR, count: 1 },
      },
    });

    await connector.ensureInstance(SHOP);
    const qrCode = await connector.requestQrCode(SHOP);

    // US-14 (C19) re-subscribes the webhook of an existing instance.
    expect(requests.map(({ method }) => method)).toEqual([
      'GET',
      'POST',
      'GET',
    ]);
    expect(requests.some(({ url }) => url.endsWith('/instance/create'))).toBe(
      false,
    );
    expect(qrCode).toBe(QR);
  });

  describe('CA-13.1 (C7): every connector failure becomes WhatsAppConnectorUnavailableError', () => {
    const cases: Array<[string, Reply]> = [
      ['no answer within the timeout', 'hang'],
      ['a network error', 'network'],
      ['an HTTP 5xx', { status: 502, body: { message: 'bad gateway' } }],
      [
        'a 200 with { error: true }',
        { status: 200, body: { error: true, message: 'Error' } },
      ],
      [
        'a connect answer without base64',
        { status: 200, body: { instance: { state: 'open' } } },
      ],
    ];

    it.each(cases)('%s', async (_, reply) => {
      const { connector } = setup({ [CONNECT_PATH]: reply });

      await expect(connector.requestQrCode(SHOP)).rejects.toBeInstanceOf(
        WhatsAppConnectorUnavailableError,
      );
    });
  });

  describe('CA-13.2 (C13): maps connectionState to the neutral state', () => {
    it.each([
      [
        'open',
        {
          status: 200,
          body: { instance: { instanceName: SHOP, state: 'open' } },
        },
        'open',
      ],
      [
        'connecting',
        {
          status: 200,
          body: { instance: { instanceName: SHOP, state: 'connecting' } },
        },
        'connecting',
      ],
      [
        'close',
        {
          status: 200,
          body: { instance: { instanceName: SHOP, state: 'close' } },
        },
        'close',
      ],
      ['404 (no instance)', { status: 404, body: { status: 404 } }, 'close'],
      [
        'state missing',
        { status: 200, body: { instance: { instanceName: SHOP } } },
        'close',
      ],
    ] as const)('%s', async (_, reply, expected) => {
      const { connector } = setup({ [STATE_PATH]: reply });

      await expect(connector.getState(SHOP)).resolves.toBe(expected);
    });
  });

  it('RNF-07 (C33): counts each failed call by operation, with no barbershop label', async () => {
    const { connector, registry } = setup({ [CONNECT_PATH]: 'network' });

    await connector.requestQrCode(SHOP).catch(() => undefined);

    const metrics = await registry.metrics();
    expect(metrics).toContain(
      'whatsapp_connector_errors_total{operation="requestQrCode"} 1',
    );
    expect(metrics).not.toContain(SHOP);
  });

  it('pings the Evolution API root', async () => {
    const { connector } = setup({ 'GET /': { status: 500 } });

    await expect(connector.ping()).rejects.toBeInstanceOf(
      WhatsAppConnectorUnavailableError,
    );
  });

  it('CA-14.1 (C18): subscribes a new instance to the connection and the messages', async () => {
    const { connector, requests } = setup({
      [STATE_PATH]: { status: 404, body: { status: 404 } },
      'POST /instance/create': { status: 201, body: { instance: {} } },
    });

    await connector.ensureInstance(SHOP);

    const create = requests.find((request) => request.method === 'POST')!;
    expect((create.body as { webhook: unknown }).webhook).toEqual(WEBHOOK);
  });

  it('CA-14.1 (C19): re-subscribes the webhook of an existing instance without creating another', async () => {
    const { connector, requests } = setup({
      [STATE_PATH]: { status: 200, body: { instance: { state: 'open' } } },
      [WEBHOOK_SET_PATH]: { status: 201, body: { webhook: {} } },
    });

    await connector.ensureInstance(SHOP);

    const set = requests.find((request) => request.method === 'POST')!;
    expect(set.url).toBe(`http://evolution.test/webhook/set/${SHOP}`);
    expect(set.headers.apikey).toBe('evolution-key');
    expect(set.body).toEqual({ webhook: WEBHOOK });
    expect(requests.some(({ url }) => url.endsWith('/instance/create'))).toBe(
      false,
    );
  });

  it('CA-14.1 (C19): fails when the webhook of an existing instance cannot be set', async () => {
    const { connector } = setup({
      [STATE_PATH]: { status: 200, body: { instance: { state: 'open' } } },
      [WEBHOOK_SET_PATH]: { status: 500, body: { message: 'boom' } },
    });

    await expect(connector.ensureInstance(SHOP)).rejects.toBeInstanceOf(
      WhatsAppConnectorUnavailableError,
    );
  });

  it('CA-14.2 (C20): sends a text to the phone without the plus sign', async () => {
    const { connector, requests } = setup({
      [SEND_TEXT_PATH]: { status: 201, body: { key: { id: 'MESSAGE-1' } } },
    });

    await connector.sendText(SHOP, '+5511987654321', 'oi');

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      `http://evolution.test/message/sendText/${SHOP}`,
    );
    expect(requests[0].headers.apikey).toBe('evolution-key');
    expect(requests[0].body).toEqual({ number: '5511987654321', text: 'oi' });
  });

  describe('CA-14.2 (C20): every failed send becomes WhatsAppConnectorUnavailableError and is counted', () => {
    const cases: Array<[string, Reply]> = [
      ['no answer within the timeout', 'hang'],
      ['a network error', 'network'],
      ['an HTTP 5xx', { status: 500, body: { message: 'boom' } }],
      [
        'a 200 with { error: true }',
        { status: 200, body: { error: true, message: 'Error' } },
      ],
    ];

    it.each(cases)('%s', async (_, reply) => {
      const { connector, registry } = setup({ [SEND_TEXT_PATH]: reply });

      await expect(
        connector.sendText(SHOP, '+5511987654321', 'oi'),
      ).rejects.toBeInstanceOf(WhatsAppConnectorUnavailableError);

      expect(await registry.metrics()).toContain(
        'whatsapp_connector_errors_total{operation="sendText"} 1',
      );
    });
  });
});

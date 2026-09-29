import { Counter, Registry } from 'prom-client';
import { WhatsAppConnectorState } from '../../../../domain/entities/whatsapp-connection';
import { WhatsAppConnectorUnavailableError } from '../../../../domain/errors/whatsapp-connector-unavailable.error';
import { WhatsAppConnector } from '../../../../usecases/ports/whatsapp-connector.port';

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  webhookUrl: string;
  webhookSecret: string;
}

type Operation =
  'ensureInstance' | 'requestQrCode' | 'getState' | 'sendText' | 'ping';

interface EvolutionResponse {
  status: number;
  body: unknown;
}

const CONNECTOR_STATES: readonly string[] = ['open', 'connecting', 'close'];
const QR_CODE_PREFIX = 'data:image/png;base64,';
// US-13 listens to the connection; US-14 on, to the client's messages.
const WEBHOOK_EVENTS = ['CONNECTION_UPDATE', 'MESSAGES_UPSERT'];

// Evolution API v2.3.7 (AD-011). Instances are named after the barbershop id,
// so the webhook can find the tenant without a lookup table.
export class EvolutionWhatsAppConnector implements WhatsAppConnector {
  private readonly errorsTotal: Counter<'operation'>;

  constructor(
    private readonly config: EvolutionConfig,
    registry: Registry,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.errorsTotal = new Counter({
      name: 'whatsapp_connector_errors_total',
      help: 'Total de chamadas ao conector de WhatsApp que falharam, por operação',
      labelNames: ['operation'],
      registers: [registry],
    });
  }

  async ensureInstance(barbershopId: string): Promise<void> {
    const operation = 'ensureInstance';
    const state = await this.call(
      operation,
      'GET',
      `/instance/connectionState/${barbershopId}`,
    );
    if (state.status !== 404) {
      this.assertOk(operation, state);
      // Instances created before US-14 only listen to the connection.
      const updated = await this.call(
        operation,
        'POST',
        `/webhook/set/${barbershopId}`,
        { webhook: this.webhook() },
      );
      this.assertOk(operation, updated);
      return;
    }
    const created = await this.call(operation, 'POST', '/instance/create', {
      instanceName: barbershopId,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: false,
      // CA-13.4: the Owner's phone keeps its notifications and unread badges.
      alwaysOnline: false,
      readMessages: false,
      webhook: this.webhook(),
    });
    this.assertOk(operation, created);
  }

  async requestQrCode(barbershopId: string): Promise<string> {
    const operation = 'requestQrCode';
    const response = await this.call(
      operation,
      'GET',
      `/instance/connect/${barbershopId}`,
    );
    this.assertOk(operation, response);
    const base64 = field(response.body, 'base64');
    if (typeof base64 !== 'string' || !base64.startsWith(QR_CODE_PREFIX)) {
      throw this.failure(operation);
    }
    return base64;
  }

  async getState(barbershopId: string): Promise<WhatsAppConnectorState> {
    const operation = 'getState';
    const response = await this.call(
      operation,
      'GET',
      `/instance/connectionState/${barbershopId}`,
    );
    // An instance the connector does not know cannot be connected.
    if (response.status === 404) return 'close';
    this.assertOk(operation, response);
    const state = field(field(response.body, 'instance'), 'state');
    return typeof state === 'string' && CONNECTOR_STATES.includes(state)
      ? (state as WhatsAppConnectorState)
      : 'close';
  }

  async sendText(
    barbershopId: string,
    phone: string,
    text: string,
  ): Promise<void> {
    const operation = 'sendText';
    const response = await this.call(
      operation,
      'POST',
      `/message/sendText/${barbershopId}`,
      { number: phone.replace(/^\+/, ''), text },
    );
    this.assertOk(operation, response);
  }

  async ping(): Promise<void> {
    this.assertOk('ping', await this.call('ping', 'GET', '/'));
  }

  private webhook() {
    return {
      enabled: true,
      url: this.config.webhookUrl,
      byEvents: false,
      events: WEBHOOK_EVENTS,
      headers: { authorization: `Bearer ${this.config.webhookSecret}` },
    };
  }

  private async call(
    operation: Operation,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<EvolutionResponse> {
    try {
      const response = await this.fetchFn(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          apikey: this.config.apiKey,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      const text = await response.text();
      return { status: response.status, body: parseJson(text) };
    } catch {
      throw this.failure(operation);
    }
  }

  // The Evolution API answers some failures with 200 and `{ error: true }`.
  private assertOk(operation: Operation, response: EvolutionResponse): void {
    const ok = response.status >= 200 && response.status < 300;
    if (!ok || field(response.body, 'error') === true) {
      throw this.failure(operation);
    }
  }

  private failure(operation: Operation): WhatsAppConnectorUnavailableError {
    this.errorsTotal.inc({ operation });
    return new WhatsAppConnectorUnavailableError();
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

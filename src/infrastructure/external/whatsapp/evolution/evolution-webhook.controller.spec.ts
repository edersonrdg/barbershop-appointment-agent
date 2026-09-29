import { Logger } from '@nestjs/common';
import {
  ApplyWhatsAppConnectionStateInput,
  ApplyWhatsAppConnectionStateResult,
  ApplyWhatsAppConnectionStateUseCase,
} from '../../../../usecases/apply-whatsapp-connection-state/apply-whatsapp-connection-state.use-case';
import {
  ReceiveWhatsAppMessageInput,
  ReceiveWhatsAppMessageUseCase,
} from '../../../../usecases/receive-whatsapp-message/receive-whatsapp-message.use-case';
import { FixedClock } from '../../../../usecases/testing/fixed-clock';
import { EvolutionWebhookController } from './evolution-webhook.controller';
import type { EvolutionWebhook } from './evolution-webhook.schema';

const SHOP = '0b9f7d8e-8a55-4c1c-9d51-6f2f3d1f0a11';
const OWNER_EMAIL = 'dono@barbearia.com';
const INSTANCE_TOKEN = 'INSTANCE-TOKEN-1234';
const NOW = new Date('2026-09-29T15:00:00.000Z');
const NOW_SECONDS = NOW.getTime() / 1000;

class SmtpError extends Error {
  override readonly name = 'SmtpError';
  readonly code = 'EENVELOPE';
}

function controllerReturning(result: ApplyWhatsAppConnectionStateResult) {
  const calls: ApplyWhatsAppConnectionStateInput[] = [];
  const useCase = {
    execute: (input: ApplyWhatsAppConnectionStateInput) => {
      calls.push(input);
      return Promise.resolve(result);
    },
  } as unknown as ApplyWhatsAppConnectionStateUseCase;
  const { receiveMessage } = receivingMessages();
  return {
    controller: new EvolutionWebhookController(
      useCase,
      receiveMessage,
      new FixedClock(NOW),
    ),
    calls,
  };
}

function receivingMessages() {
  const calls: ReceiveWhatsAppMessageInput[] = [];
  const receiveMessage = {
    execute: (input: ReceiveWhatsAppMessageInput) => {
      calls.push(input);
      return Promise.resolve({ outcome: 'none' });
    },
  } as unknown as ReceiveWhatsAppMessageUseCase;
  return { receiveMessage, calls };
}

function messageController() {
  const applyState = {
    execute: () => Promise.reject(new Error('not a connection update')),
  } as unknown as ApplyWhatsAppConnectionStateUseCase;
  const { receiveMessage, calls } = receivingMessages();
  return {
    controller: new EvolutionWebhookController(
      applyState,
      receiveMessage,
      new FixedClock(NOW),
    ),
    calls,
  };
}

function message(
  data: Record<string, unknown> = {},
  key: Record<string, unknown> = {},
): EvolutionWebhook {
  return {
    event: 'messages.upsert',
    instance: SHOP,
    data: {
      key: {
        remoteJid: '5511987654321@s.whatsapp.net',
        fromMe: false,
        id: 'MESSAGE-1',
        ...key,
      },
      pushName: 'João Silva',
      message: { conversation: 'Oi, tudo bem?' },
      messageType: 'conversation',
      messageTimestamp: NOW_SECONDS,
      ...data,
    },
    apikey: INSTANCE_TOKEN,
  };
}

function body(overrides: Partial<EvolutionWebhook> = {}): EvolutionWebhook {
  return {
    event: 'connection.update',
    instance: SHOP,
    data: {
      instance: SHOP,
      state: 'close',
      wuid: '5511912345678@s.whatsapp.net',
    },
    apikey: INSTANCE_TOKEN,
    ...overrides,
  };
}

function loggedArguments(spies: jest.SpyInstance[]): string {
  return JSON.stringify(spies.flatMap((spy) => spy.mock.calls as unknown[]));
}

describe('EvolutionWebhookController', () => {
  let spies: jest.SpyInstance[];

  beforeEach(() => {
    spies = (['log', 'error', 'warn', 'debug', 'verbose'] as const).map(
      (method) =>
        jest
          .spyOn(Logger.prototype, method)
          .mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('CA-13.3 (C21): logs a failed drop alert with only the barbershop id and the error identity', async () => {
    const { controller } = controllerReturning({
      connection: null,
      alert: {
        outcome: 'failed',
        error: new SmtpError(`Recipient ${OWNER_EMAIL} rejected`),
      },
    });

    await controller.receive(body());

    const error = spies[1];
    expect(error).toHaveBeenCalledTimes(1);
    const [[context]] = error.mock.calls as unknown[][];
    expect(context).toEqual({
      barbershopId: SHOP,
      err: { name: 'SmtpError', code: 'EENVELOPE' },
    });
    expect(loggedArguments(spies)).not.toContain(OWNER_EMAIL);
  });

  it.each([
    ['applied', body()],
    ['ignored', body({ event: 'messages.upsert' })],
    ['invalid state', body({ data: { state: 'pending' } })],
  ])(
    'CA-13.3 (C27): never logs the body, the apikey or the authorization (%s)',
    async (_, payload) => {
      const { controller } = controllerReturning({
        connection: null,
        alert: { outcome: 'failed', error: new SmtpError('boom') },
      });

      await controller.receive(payload);

      const logged = loggedArguments(spies);
      expect(logged).not.toContain(INSTANCE_TOKEN);
      expect(logged).not.toContain('5511912345678');
      expect(logged).not.toContain('Bearer');
      expect(logged).not.toContain('connection.update');
    },
  );

  it('maps refused to close and hands the barbershop id to the use case', async () => {
    const { controller, calls } = controllerReturning({
      connection: null,
      alert: { outcome: 'none' },
    });

    await controller.receive(body({ data: { state: 'refused' } }));

    expect(calls).toEqual([{ barbershopId: SHOP, state: 'close' }]);
  });

  it.each([
    ['sent by the barbershop number', message({}, { fromMe: true })],
    ['from a group', message({}, { remoteJid: '120363000000000000@g.us' })],
    ['from a status broadcast', message({}, { remoteJid: 'status@broadcast' })],
    [
      'from a newsletter',
      message({}, { remoteJid: '120363000000000000@newsletter' }),
    ],
    [
      'from a lid without phone',
      message({}, { remoteJid: '123456789012345@lid' }),
    ],
    ['301 s old', message({ messageTimestamp: NOW_SECONDS - 301 })],
    ['without timestamp', message({ messageTimestamp: undefined })],
    [
      'from a foreign phone',
      message({}, { remoteJid: '14155550123@s.whatsapp.net' }),
    ],
    [
      'to an instance that is not a uuid',
      { ...message(), instance: 'barbearia' },
    ],
    ['without data', { ...message(), data: undefined }],
    ['without key', message({ key: undefined })],
    ['with a numeric remoteJid', message({}, { remoteJid: 5511987654321 })],
    ['without fromMe', message({}, { fromMe: undefined })],
  ])('CA-14.1 (C15): ignores a message %s', async (_case, payload) => {
    const { controller, calls } = messageController();

    await expect(controller.receive(payload)).resolves.toBeUndefined();

    expect(calls).toEqual([]);
  });

  it('CA-14.1 (C15): hands a 300 s old client message to the use case with only the tenant, phone and profile name', async () => {
    const { controller, calls } = messageController();

    await controller.receive(message({ messageTimestamp: NOW_SECONDS - 300 }));

    expect(calls).toEqual([
      {
        barbershopId: SHOP,
        phone: '+5511987654321',
        profileName: 'João Silva',
      },
    ]);
  });
});

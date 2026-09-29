import { Logger } from '@nestjs/common';
import {
  ApplyWhatsAppConnectionStateInput,
  ApplyWhatsAppConnectionStateResult,
  ApplyWhatsAppConnectionStateUseCase,
} from '../../../../usecases/apply-whatsapp-connection-state/apply-whatsapp-connection-state.use-case';
import { EvolutionWebhookController } from './evolution-webhook.controller';
import type { EvolutionWebhook } from './evolution-webhook.schema';

const SHOP = '0b9f7d8e-8a55-4c1c-9d51-6f2f3d1f0a11';
const OWNER_EMAIL = 'dono@barbearia.com';
const INSTANCE_TOKEN = 'INSTANCE-TOKEN-1234';

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
  return { controller: new EvolutionWebhookController(useCase), calls };
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
});

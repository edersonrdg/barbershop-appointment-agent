import { Logger } from '@nestjs/common';
import {
  AnswerClientQuestionInput,
  AnswerClientQuestionUseCase,
  ClientReplyResult,
} from '../../../../usecases/answer-client-question/answer-client-question.use-case';
import {
  ApplyWhatsAppConnectionStateInput,
  ApplyWhatsAppConnectionStateResult,
  ApplyWhatsAppConnectionStateUseCase,
} from '../../../../usecases/apply-whatsapp-connection-state/apply-whatsapp-connection-state.use-case';
import {
  ReceiveWhatsAppMessageInput,
  ReceiveWhatsAppMessageUseCase,
} from '../../../../usecases/receive-whatsapp-message/receive-whatsapp-message.use-case';
import {
  RecordConversationActivityInput,
  RecordConversationActivityUseCase,
} from '../../../../usecases/record-conversation-activity/record-conversation-activity.use-case';
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
  const { answerQuestion } = answering();
  const { recordActivity } = recordingActivity();
  return {
    controller: new EvolutionWebhookController(
      useCase,
      receiveMessage,
      answerQuestion,
      new FixedClock(NOW),
      recordActivity,
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

function answering(result: ClientReplyResult = { outcome: 'none' }) {
  const calls: AnswerClientQuestionInput[] = [];
  const answerQuestion = {
    execute: (input: AnswerClientQuestionInput) => {
      calls.push(input);
      return Promise.resolve(result);
    },
  } as unknown as AnswerClientQuestionUseCase;
  return { answerQuestion, calls };
}

function recordingActivity() {
  const calls: RecordConversationActivityInput[] = [];
  const recordActivity = {
    execute: (input: RecordConversationActivityInput) => {
      calls.push(input);
      return Promise.resolve();
    },
  } as unknown as RecordConversationActivityUseCase;
  return { recordActivity, calls };
}

function messageController(reply?: ClientReplyResult) {
  const applyState = {
    execute: () => Promise.reject(new Error('not a connection update')),
  } as unknown as ApplyWhatsAppConnectionStateUseCase;
  const { receiveMessage, calls } = receivingMessages();
  const { answerQuestion, calls: answers } = answering(reply);
  const { recordActivity, calls: activities } = recordingActivity();
  return {
    controller: new EvolutionWebhookController(
      applyState,
      receiveMessage,
      answerQuestion,
      new FixedClock(NOW),
      recordActivity,
    ),
    calls,
    answers,
    activities,
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
    const { controller, calls, answers } = messageController();

    await expect(controller.receive(payload)).resolves.toBeUndefined();

    expect(calls).toEqual([]);
    expect(answers).toEqual([]);
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

  it.each([
    ['conversation', { conversation: 'quanto custa o corte?' }],
    [
      'extendedTextMessage',
      { extendedTextMessage: { text: 'quanto custa o corte?' } },
    ],
  ])(
    'CA-15.1: hands the id and the %s text to the answer use case',
    async (_case, content) => {
      const { controller, answers } = messageController();

      await controller.receive(message({ message: content }));

      expect(answers).toEqual([
        {
          barbershopId: SHOP,
          phone: '+5511987654321',
          messageId: 'MESSAGE-1',
          text: 'quanto custa o corte?',
        },
      ]);
    },
  );

  it.each([
    ['an audio', message({ message: { audioMessage: {} } })],
    ['no message', message({ message: undefined })],
    ['no id', message({}, { id: undefined })],
  ])(
    'AC 14: does not answer a message with %s, but still hands the contact to US-14',
    async (_case, payload) => {
      const { controller, calls, answers } = messageController();

      await controller.receive(payload);

      expect(calls).toHaveLength(1);
      expect(answers).toEqual([]);
    },
  );

  it('AC 18 (C19): logs a failed reply with only the barbershop id and the error identity', async () => {
    const { controller } = messageController({
      outcome: 'failed',
      error: new SmtpError('send to +5511987654321 failed: quanto custa?'),
    });

    await controller.receive(
      message({ message: { conversation: 'quanto custa?' } }),
    );

    const error = spies[1];
    expect(error).toHaveBeenCalledTimes(1);
    const [[context]] = error.mock.calls as unknown[][];
    expect(context).toEqual({
      barbershopId: SHOP,
      err: { name: 'SmtpError', code: 'EENVELOPE' },
    });
    const logged = loggedArguments(spies);
    expect(logged).not.toContain('5511987654321');
    expect(logged).not.toContain('quanto custa');
  });

  it('AC 3 (C3): logs a failed hand-off notice with only the barbershop id and the error identity', async () => {
    const { controller } = messageController({
      outcome: 'failed',
      error: new SmtpError(
        'send to +5511987654321 failed: quero falar com alguém',
      ),
      handoff: 'requested',
    });

    await controller.receive(
      message({ message: { conversation: 'quero falar com alguém' } }),
    );

    const error = spies[1];
    expect(error).toHaveBeenCalledTimes(1);
    const [[context]] = error.mock.calls as unknown[][];
    expect(context).toEqual({
      barbershopId: SHOP,
      err: { name: 'SmtpError', code: 'EENVELOPE' },
    });
    const logged = loggedArguments(spies);
    expect(logged).not.toContain('5511987654321');
    expect(logged).not.toContain('quero falar');
  });

  it.each(['requested', 'not_understood'] as const)(
    'AC 27 (C26): logs a %s hand-off with only the barbershop id and the reason',
    async (reason) => {
      const { controller } = messageController({
        outcome: 'sent',
        kind: 'handoff',
        handoff: reason,
      });

      await controller.receive(
        message({ message: { conversation: 'quero falar com alguém' } }),
      );

      const log = spies[0];
      expect(log).toHaveBeenCalledTimes(1);
      const [[context]] = log.mock.calls as unknown[][];
      expect(context).toEqual({ barbershopId: SHOP, reason });
      const logged = loggedArguments(spies);
      expect(logged).not.toContain('5511987654321');
      expect(logged).not.toContain('quero falar');
    },
  );

  it('AC 10: records the activity of a team message and of a message without text', async () => {
    const { controller, calls, answers, activities } = messageController();

    await controller.receive(message({}, { fromMe: true }));
    await controller.receive(message({ message: { audioMessage: {} } }));

    expect(activities).toEqual([
      { barbershopId: SHOP, phone: '+5511987654321' },
      { barbershopId: SHOP, phone: '+5511987654321' },
    ]);
    expect(calls).toHaveLength(1);
    expect(answers).toEqual([]);
  });
});

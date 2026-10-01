import { Logger } from '@nestjs/common';
import type { GenerateContentParameters } from '@google/genai';
import { Registry } from 'prom-client';
import { z } from 'zod';
import { MessageInterpreterUnavailableError } from '../../../domain/errors/message-interpreter-unavailable.error';
import {
  GeminiGenerateResult,
  GeminiMessageInterpreter,
  GeminiModels,
} from './gemini-message-interpreter';
import { messageInterpretationSchema } from './message-interpretation.schema';

const MODEL = 'gemini-2.5-flash';
const CLIENT_TEXT = 'quanto custa corte e barba? meu CPF é 123';
const INPUT = {
  barbershopName: 'Barbearia do Zé',
  serviceNames: ['Barba', 'Corte'],
  text: CLIENT_TEXT,
  today: { date: '2026-09-29', weekday: 'terça-feira' },
  barberNames: ['João', 'Pedro'],
  offeredOptions: [
    'quarta-feira, 30/09, às 12:00, com João',
    'quarta-feira, 30/09, às 12:30, com Pedro',
  ],
  appointmentOptions: [
    'Corte, terça-feira, 29/09, às 15:00, com João',
    'Barba, quarta-feira, 30/09, às 10:00, com João',
  ],
};
const VALID = {
  topics: ['services'],
  services: ['Corte', 'Barba'],
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
};

class FakeModels implements GeminiModels {
  readonly calls: GenerateContentParameters[] = [];
  readonly gets: { model: string }[] = [];
  result: GeminiGenerateResult = {
    text: JSON.stringify(VALID),
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 15 },
  };
  mode: 'ok' | 'reject' | 'hang' = 'ok';

  generateContent(
    params: GenerateContentParameters,
  ): Promise<GeminiGenerateResult> {
    this.calls.push(params);
    if (this.mode === 'reject') {
      return Promise.reject(new Error('503 UNAVAILABLE'));
    }
    if (this.mode === 'hang') {
      return new Promise((_resolve, reject) => {
        params.config?.abortSignal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      });
    }
    return Promise.resolve(this.result);
  }

  get(params: { model: string }): Promise<unknown> {
    this.gets.push(params);
    return Promise.resolve({ name: params.model });
  }
}

function setup(timeoutMs = 1000) {
  const models = new FakeModels();
  const registry = new Registry();
  const logger = new Logger('test');
  const logs: unknown[] = [];
  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
  }
  const interpreter = new GeminiMessageInterpreter(
    { model: MODEL, timeoutMs },
    models,
    registry,
    logger,
  );
  const metric = async (line: string): Promise<number> => {
    const found = (await registry.metrics())
      .split('\n')
      .find((item) => item.startsWith(`${line} `));
    return found ? Number(found.split(' ')[1]) : 0;
  };
  return { interpreter, models, registry, logs, metric };
}

function withText(text: string | undefined): GeminiGenerateResult {
  return { text, usageMetadata: {} };
}

describe('GeminiMessageInterpreter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('AC 22 (C22): calls generateContent with the model, JSON output and a timeout', async () => {
    const { interpreter, models } = setup();

    const result = await interpreter.interpret(INPUT);

    expect(result).toEqual(VALID);
    expect(models.calls).toHaveLength(1);
    const [call] = models.calls;
    expect(call.model).toBe(MODEL);
    expect(call.contents).toBe(CLIENT_TEXT);
    expect(call.config).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(messageInterpretationSchema),
      temperature: 0,
    });
    expect(call.config?.abortSignal).toBeInstanceOf(AbortSignal);
    const instruction = call.config?.systemInstruction;
    expect(typeof instruction).toBe('string');
    for (const expected of ['Barbearia do Zé', 'Barba', 'Corte']) {
      expect(instruction as string).toContain(expected);
    }
  });

  it('AC 22 (C22): pings the configured model', async () => {
    const { interpreter, models } = setup();

    await interpreter.ping();

    expect(models.gets).toEqual([{ model: MODEL }]);
  });

  const sixty = 'a'.repeat(60);
  it.each<[string, (models: FakeModels) => void]>([
    ['the SDK rejects', (models) => (models.mode = 'reject')],
    ['the timeout fires', (models) => (models.mode = 'hang')],
    ['the text is not JSON', (models) => (models.result = withText('oi'))],
    ['the text is missing', (models) => (models.result = withText(undefined))],
    [
      'offTopic is missing',
      (models) =>
        (models.result = withText(
          JSON.stringify({ ...VALID, offTopic: undefined }),
        )),
    ],
    [
      'a topic is outside the enum',
      (models) =>
        (models.result = withText(
          JSON.stringify({ ...VALID, topics: ['booking'] }),
        )),
    ],
    [
      'there are 4 unknown services',
      (models) =>
        (models.result = withText(
          JSON.stringify({ ...VALID, unknownServices: ['a', 'b', 'c', 'd'] }),
        )),
    ],
    [
      'an unknown service has 61 characters',
      (models) =>
        (models.result = withText(
          JSON.stringify({ ...VALID, unknownServices: [`${sixty}b`] }),
        )),
    ],
  ])('AC 17, AC 20 (C18): rejects when %s', async (_case, arrange) => {
    const { interpreter, models } = setup(20);
    arrange(models);

    await expect(interpreter.interpret(INPUT)).rejects.toBeInstanceOf(
      MessageInterpreterUnavailableError,
    );
  });

  it('AC 20 (C18): accepts 3 unknown services of 60 characters', async () => {
    const { interpreter, models } = setup();
    const unknownServices = [sixty, sixty, sixty];
    models.result = withText(JSON.stringify({ ...VALID, unknownServices }));

    await expect(interpreter.interpret(INPUT)).resolves.toMatchObject({
      unknownServices,
    });
  });

  it('RNF-01 (C24): counts a successful call, its latency and its tokens', async () => {
    const { interpreter, metric } = setup();

    await interpreter.interpret(INPUT);

    expect(await metric('gemini_requests_total{outcome="ok"}')).toBe(1);
    expect(await metric('gemini_tokens_total{type="prompt"}')).toBe(120);
    expect(await metric('gemini_tokens_total{type="output"}')).toBe(15);
    expect(await metric('gemini_request_duration_seconds_count')).toBe(1);
  });

  it.each<[string, (models: FakeModels) => void]>([
    ['error', (models) => (models.mode = 'reject')],
    ['timeout', (models) => (models.mode = 'hang')],
    ['invalid', (models) => (models.result = withText('{"topics":1}'))],
  ])('RNF-01 (C24): counts the outcome %s', async (outcome, arrange) => {
    const { interpreter, models, metric } = setup(20);
    arrange(models);

    await interpreter.interpret(INPUT).catch(() => undefined);

    expect(await metric(`gemini_requests_total{outcome="${outcome}"}`)).toBe(1);
    expect(await metric('gemini_request_duration_seconds_count')).toBe(1);
  });

  it('RNF-01 (C24): labels the Gemini metrics only by outcome or type', async () => {
    const { interpreter, registry } = setup();

    await interpreter.interpret(INPUT);

    const metrics = await registry.getMetricsAsJSON();
    const labels = metrics
      .filter((metric) => metric.name.startsWith('gemini_'))
      .flatMap((metric) =>
        metric.values.flatMap((value) => Object.keys(value.labels)),
      );
    expect(new Set(labels)).toEqual(new Set(['outcome', 'type', 'le']));
  });

  it.each<[string, (models: FakeModels) => void]>([
    ['ok', () => undefined],
    ['error', (models) => (models.mode = 'reject')],
  ])(
    'AC 25 (C25): logs the call (%s) without the client text or the model output',
    async (outcome, arrange) => {
      const { interpreter, models, logs } = setup();
      arrange(models);

      await interpreter.interpret(INPUT).catch(() => undefined);

      expect(logs).toHaveLength(1);
      const [[entry]] = logs as [[Record<string, unknown>]];
      expect(entry).toMatchObject({ model: MODEL, outcome });
      expect(typeof entry.latencyMs).toBe('number');
      if (outcome === 'ok') {
        expect(entry).toMatchObject({ promptTokens: 120, outputTokens: 15 });
      }
      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain(CLIENT_TEXT);
      expect(serialized).not.toContain(JSON.stringify(VALID));
      expect(serialized).not.toContain('Barbearia do Zé');
    },
  );

  describe('US-16 (C4): humanRequested', () => {
    it.each([
      ['missing', { ...VALID, humanRequested: undefined }],
      ['not a boolean', { ...VALID, humanRequested: 'sim' }],
    ])(
      'rejects an interpretation with humanRequested %s',
      async (_case, output) => {
        const { interpreter, models } = setup();
        models.result = withText(JSON.stringify(output));

        await expect(interpreter.interpret(INPUT)).rejects.toBeInstanceOf(
          MessageInterpreterUnavailableError,
        );
      },
    );

    it('passes humanRequested through and asks the model for it', async () => {
      const { interpreter, models } = setup();
      models.result = withText(
        JSON.stringify({ ...VALID, humanRequested: true }),
      );

      const result = await interpreter.interpret(INPUT);

      expect(result.humanRequested).toBe(true);
      const schema = models.calls[0].config?.responseJsonSchema as {
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schema.properties).toHaveProperty('humanRequested');
      expect(schema.required).toContain('humanRequested');
      expect(models.calls[0].config?.systemInstruction).toEqual(
        expect.stringContaining('humanRequested'),
      );
    });
  });

  describe('US-17 booking fields (door 1)', () => {
    const BOOKING = {
      ...VALID,
      bookingRequested: true,
      barber: 'João',
      anyBarber: false,
      date: '2026-09-30',
      period: 'afternoon',
      time: '15:00',
      choice: 2,
    };

    it('door 1 (C37): passes the booking fields through', async () => {
      const { interpreter, models } = setup();
      models.result = withText(JSON.stringify(BOOKING));

      await expect(interpreter.interpret(INPUT)).resolves.toEqual(BOOKING);
    });

    it.each<[string, Record<string, unknown>]>([
      ['a date in another format', { date: '30/09/2026' }],
      ['a date the calendar does not have', { date: '2026-02-30' }],
      ['an hour past 23', { time: '25:00' }],
      ['a period outside the enum', { period: 'night' }],
      ['choice 0', { choice: 0 }],
      ['choice 11', { choice: 11 }],
      ['a fractional choice', { choice: 1.5 }],
      ['no bookingRequested', { bookingRequested: undefined }],
    ])('door 1 (C37): rejects %s', async (_case, override) => {
      const { interpreter, models } = setup();
      models.result = withText(JSON.stringify({ ...BOOKING, ...override }));

      await expect(interpreter.interpret(INPUT)).rejects.toBeInstanceOf(
        MessageInterpreterUnavailableError,
      );
    });

    it('door 1 (C37): requires the 7 fields in the response schema and gives the context in the instruction', async () => {
      const { interpreter, models } = setup();

      await interpreter.interpret(INPUT);

      const schema = models.calls[0].config?.responseJsonSchema as {
        required: string[];
        properties: Record<string, unknown>;
      };
      for (const field of [
        'bookingRequested',
        'barber',
        'anyBarber',
        'date',
        'period',
        'time',
        'choice',
      ]) {
        expect(schema.required).toContain(field);
        expect(schema.properties).toHaveProperty(field);
      }
      const instruction = models.calls[0].config?.systemInstruction as string;
      for (const expected of [
        '2026-09-29',
        'terça-feira',
        'João',
        'Pedro',
        'quarta-feira, 30/09, às 12:00, com João',
        'quarta-feira, 30/09, às 12:30, com Pedro',
      ]) {
        expect(instruction).toContain(expected);
      }
    });
  });

  describe('US-18 cancel and reschedule fields (doors 1 and 5)', () => {
    const CANCEL = { ...VALID, cancelRequested: true, choice: 10 };

    it('door 1 (C1): passes cancelRequested, rescheduleRequested and a choice of 10 through', async () => {
      const { interpreter, models } = setup();
      models.result = withText(JSON.stringify(CANCEL));

      await expect(interpreter.interpret(INPUT)).resolves.toEqual(CANCEL);
    });

    it.each<[string, Record<string, unknown>]>([
      ['choice 11', { choice: 11 }],
      ['no cancelRequested', { cancelRequested: undefined }],
      ['no rescheduleRequested', { rescheduleRequested: undefined }],
    ])('door 1 (C1): rejects %s', async (_case, override) => {
      const { interpreter, models } = setup();
      models.result = withText(JSON.stringify({ ...CANCEL, ...override }));

      await expect(interpreter.interpret(INPUT)).rejects.toBeInstanceOf(
        MessageInterpreterUnavailableError,
      );
    });

    it('door 1 (C1): requires both fields and lists the appointments in the instruction', async () => {
      const { interpreter, models } = setup();

      await interpreter.interpret(INPUT);

      const schema = models.calls[0].config?.responseJsonSchema as {
        required: string[];
      };
      expect(schema.required).toEqual(
        expect.arrayContaining(['cancelRequested', 'rescheduleRequested']),
      );
      const instruction = models.calls[0].config?.systemInstruction as string;
      expect(instruction).toContain(
        '1. Corte, terça-feira, 29/09, às 15:00, com João',
      );
      expect(instruction).toContain(
        '2. Barba, quarta-feira, 30/09, às 10:00, com João',
      );
    });
  });
});

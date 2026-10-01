import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MESSAGE_INTERPRETER } from './../src/usecases/ports/message-interpreter.port';
import { WHATSAPP_CONNECTOR } from './../src/usecases/ports/whatsapp-connector.port';
import { FakeMessageInterpreter } from './../src/usecases/testing/fake-message-interpreter';
import { FakeWhatsAppConnector } from './../src/usecases/testing/fake-whatsapp-connector';
import { stopScheduledJobs } from './support/stop-scheduled-jobs';

describe('Observability (e2e)', () => {
  let app: INestApplication<App>;
  // The readiness check pings the WhatsApp connector; no e2e talks to a real
  // Evolution API.
  const connector = new FakeWhatsAppConnector();
  // Nor does any e2e call the real Gemini API.
  const interpreter = new FakeMessageInterpreter();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WHATSAPP_CONNECTOR)
      .useValue(connector)
      .overrideProvider(MESSAGE_INTERPRETER)
      .useValue(interpreter)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    stopScheduledJobs(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live responds ok', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'ok' }));
  });

  it('GET /health/ready reports the database as up', () => {
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ info: { database: { status: 'up' } } }),
      );
  });

  it('RNF-07 (C32): GET /health/ready reports the WhatsApp connector up', () => {
    connector.reset();

    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          details: {
            database: { status: 'up' },
            whatsapp: { status: 'up' },
          },
        }),
      );
  });

  it('RNF-07 (C32): GET /health/ready answers 503 when the WhatsApp connector is down', async () => {
    connector.reset();
    connector.failing.add('ping');

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          details: { whatsapp: { status: 'down' } },
        }),
      );
    connector.reset();
  });

  it('US-15 (C27): GET /health/ready reports Gemini up', () => {
    connector.reset();
    interpreter.reset();

    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ details: { gemini: { status: 'up' } } }),
      );
  });

  it('US-15 (C27): GET /health/ready answers 503 when Gemini is down', async () => {
    connector.reset();
    interpreter.reset();
    interpreter.pingFailing = true;

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          details: { gemini: { status: 'down' } },
        }),
      );
    interpreter.reset();
  });

  it('GET /metrics exposes Prometheus metrics', () => {
    return request(app.getHttpServer())
      .get('/metrics')
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect(({ text }) =>
        expect(text).toContain('http_request_duration_seconds'),
      );
  });

  it('echoes the incoming x-request-id header', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .set('x-request-id', 'diagnostic-123')
      .expect('x-request-id', 'diagnostic-123');
  });
});

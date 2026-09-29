import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { WHATSAPP_CONNECTOR } from './../src/usecases/ports/whatsapp-connector.port';
import { FakeWhatsAppConnector } from './../src/usecases/testing/fake-whatsapp-connector';

describe('Observability (e2e)', () => {
  let app: INestApplication<App>;
  // The readiness check pings the WhatsApp connector; no e2e talks to a real
  // Evolution API.
  const connector = new FakeWhatsAppConnector();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WHATSAPP_CONNECTOR)
      .useValue(connector)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
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

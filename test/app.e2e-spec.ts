import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Observability (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

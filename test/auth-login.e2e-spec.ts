import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const EMAIL = 'dono@barbearia.com';
const PASSWORD = 'senha-secreta-123';

describe('POST /auth/login (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtSecret: string;
  let sessionTtlSeconds: number;

  function login(body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/auth/login').send(body);
  }

  beforeAll(async () => {
    ({ app, dataSource } = await createAccountTestApp());
    const config = app.get(ConfigService);
    jwtSecret = config.getOrThrow<string>('JWT_SECRET');
    sessionTtlSeconds = config.getOrThrow<number>('AUTH_SESSION_TTL_SECONDS');
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        barbershopName: 'Barbearia do Zé',
        ownerName: 'José da Silva',
        email: EMAIL,
        phone: '11912345678',
        password: PASSWORD,
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with a session token for correct credentials, e-mail in other casing', async () => {
    const response = await login({
      email: '  DONO@Barbearia.COM ',
      password: PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accessToken: expect.any(String) as unknown,
      tokenType: 'Bearer',
      expiresIn: sessionTtlSeconds,
    });
    const [user] = await dataSource.query<
      { id: string; barbershop_id: string }[]
    >('SELECT id, barbershop_id FROM users');
    const claims = await new JwtService({ secret: jwtSecret }).verifyAsync<{
      sub: string;
      barbershopId: string;
      role: string;
    }>((response.body as { accessToken: string }).accessToken);
    expect(claims).toMatchObject({
      sub: user.id,
      barbershopId: user.barbershop_id,
      role: 'owner',
    });
  });

  it('responds 401 with identical bodies for a wrong password and an unknown e-mail', async () => {
    const wrongPassword = await login({
      email: EMAIL,
      password: 'outra-senha-123',
    });
    const unknownEmail = await login({
      email: 'ninguem@barbearia.com',
      password: PASSWORD,
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual({
      message: 'E-mail ou senha inválidos.',
    });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it.each([
    ['missing e-mail', { password: PASSWORD }, 'email'],
    ['non-string e-mail', { email: 123, password: PASSWORD }, 'email'],
    ['missing password', { email: EMAIL }, 'password'],
    ['empty password', { email: EMAIL, password: '' }, 'password'],
    [
      'password over 72 chars',
      { email: EMAIL, password: 'x'.repeat(73) },
      'password',
    ],
  ])('responds 400 for an invalid payload (%s)', async (_case, body, field) => {
    const response = await login(body);

    expect(response.status).toBe(400);
    const errorBody = response.body as {
      message: string;
      errors: { field: string }[];
    };
    expect(errorBody.message).toBe('Dados inválidos.');
    expect(errorBody.errors.map((error) => error.field)).toEqual([field]);
  });
});

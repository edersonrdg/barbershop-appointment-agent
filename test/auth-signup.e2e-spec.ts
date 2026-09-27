import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const PASSWORD = 'senha-secreta-123';

function validSignup(overrides: Record<string, unknown> = {}) {
  return {
    barbershopName: 'Barbearia do Zé',
    ownerName: 'José da Silva',
    email: 'dono@barbearia.com',
    phone: '11912345678',
    password: PASSWORD,
    ...overrides,
  };
}

interface CountRow {
  count: string;
}

describe('POST /auth/signup (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtSecret: string;
  let sessionTtlSeconds: number;

  async function count(table: 'barbershops' | 'users'): Promise<number> {
    const rows: CountRow[] = await dataSource.query(
      `SELECT count(*) FROM ${table}`,
    );
    return Number(rows[0].count);
  }

  function signup(body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/auth/signup').send(body);
  }

  beforeAll(async () => {
    ({ app, dataSource } = await createAccountTestApp());
    const config = app.get(ConfigService);
    jwtSecret = config.getOrThrow<string>('JWT_SECRET');
    sessionTtlSeconds = config.getOrThrow<number>('AUTH_SESSION_TTL_SECONDS');
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('CA-01.1: responds 201 with a Bearer session token for the new owner and barbershop', async () => {
    const response = await signup(validSignup());

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accessToken: expect.any(String) as unknown,
      tokenType: 'Bearer',
      expiresIn: sessionTtlSeconds,
    });

    const [user] = await dataSource.query<
      { id: string; barbershop_id: string; role: string }[]
    >('SELECT id, barbershop_id, role FROM users');
    const [barbershop] = await dataSource.query<{ id: string; name: string }[]>(
      'SELECT id, name FROM barbershops',
    );
    expect(user.role).toBe('owner');
    expect(user.barbershop_id).toBe(barbershop.id);
    expect(barbershop.name).toBe('Barbearia do Zé');

    const claims = await new JwtService({ secret: jwtSecret }).verifyAsync<{
      sub: string;
      barbershopId: string;
      role: string;
    }>((response.body as { accessToken: string }).accessToken);
    expect(claims).toMatchObject({
      sub: user.id,
      barbershopId: barbershop.id,
      role: 'owner',
    });
  });

  it('CA-01.1: stores only a hash of the password and never returns it', async () => {
    const response = await signup(validSignup());

    expect(response.status).toBe(201);
    expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
    const [user] = await dataSource.query<{ password_hash: string }[]>(
      'SELECT password_hash FROM users',
    );
    expect(user.password_hash).not.toBe(PASSWORD);
    expect(user.password_hash).not.toContain(PASSWORD);
    expect(user.password_hash.startsWith('scrypt$')).toBe(true);
  });

  it.each([
    ['barbershopName', undefined],
    ['barbershopName', ' A '],
    ['barbershopName', 'B'.repeat(101)],
    ['ownerName', undefined],
    ['ownerName', 'J'],
    ['ownerName', 'J'.repeat(101)],
    ['email', undefined],
    ['email', 'dono-sem-arroba.com'],
    ['phone', undefined],
    ['phone', '1234'],
    ['phone', '(00) 91234-5678'],
    ['password', undefined],
    ['password', 'curta12'],
    ['password', 'x'.repeat(73)],
  ])(
    'CA-01.1: rejects %s = %p with 400 listing the field and persists nothing',
    async (field, value) => {
      const response = await signup(validSignup({ [field]: value }));

      expect(response.status).toBe(400);
      const body = response.body as {
        message: string;
        errors: { field: string; message: string }[];
      };
      expect(body.message).toBe('Dados inválidos.');
      expect(body.errors.map((error) => error.field)).toEqual([field]);
      expect(body.errors[0].message).toEqual(expect.any(String));
      expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
      expect(await count('barbershops')).toBe(0);
      expect(await count('users')).toBe(0);
    },
  );

  it('CA-01.1: lists every invalid field when the body is empty', async () => {
    const response = await signup({});

    expect(response.status).toBe(400);
    const fields = (response.body as { errors: { field: string }[] }).errors
      .map((error) => error.field)
      .sort();
    expect(fields).toEqual(
      ['barbershopName', 'email', 'ownerName', 'password', 'phone'].sort(),
    );
    expect(await count('barbershops')).toBe(0);
  });

  it('CA-01.2: starts a 14-day trial with no payment data in the payload', async () => {
    const response = await signup(validSignup());

    expect(response.status).toBe(201);
    const [barbershop] = await dataSource.query<
      { subscription_status: string; trial_seconds: string }[]
    >(
      `SELECT subscription_status,
              EXTRACT(EPOCH FROM trial_ends_at - created_at) AS trial_seconds
         FROM barbershops`,
    );
    expect(barbershop.subscription_status).toBe('trialing');
    expect(Number(barbershop.trial_seconds)).toBe(14 * 24 * 60 * 60);
  });

  it('CA-01.3: rejects an already registered e-mail with other casing and spaces with 409', async () => {
    expect((await signup(validSignup())).status).toBe(201);

    const response = await signup(
      validSignup({
        email: '  DONO@Barbearia.COM ',
        barbershopName: 'Outra Barbearia',
      }),
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      message: 'Este e-mail já está cadastrado.',
    });
    expect(await count('barbershops')).toBe(1);
    expect(await count('users')).toBe(1);
  });

  it('CA-01.3: two concurrent signups with the same e-mail yield one 201 and one 409 without an orphan barbershop', async () => {
    const responses = await Promise.all([
      signup(validSignup({ barbershopName: 'Barbearia Um' })),
      signup(validSignup({ barbershopName: 'Barbearia Dois' })),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await count('barbershops')).toBe(1);
    expect(await count('users')).toBe(1);
    const orphans: CountRow[] = await dataSource.query(
      `SELECT count(*) FROM barbershops b
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.barbershop_id = b.id)`,
    );
    expect(Number(orphans[0].count)).toBe(0);
  });

  it('CA-01.1: ignores extra fields (role, barbershopId, card) and creates an owner of a new barbershop', async () => {
    expect(
      (await signup(validSignup({ email: 'outro@barbearia.com' }))).status,
    ).toBe(201);
    const [existing] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM barbershops',
    );

    const response = await signup(
      validSignup({
        role: 'admin',
        barbershopId: existing.id,
        card: { number: '4111111111111111', cvv: '123' },
      }),
    );

    expect(response.status).toBe(201);
    const [user] = await dataSource.query<
      { role: string; barbershop_id: string }[]
    >('SELECT role, barbershop_id FROM users WHERE email = $1', [
      'dono@barbearia.com',
    ]);
    expect(user.role).toBe('owner');
    expect(user.barbershop_id).not.toBe(existing.id);
    expect(await count('barbershops')).toBe(2);
  });

  it('CA-01.1: stores a masked phone number in E.164', async () => {
    const response = await signup(validSignup({ phone: '(11) 91234-5678' }));

    expect(response.status).toBe(201);
    const [user] = await dataSource.query<{ phone: string }[]>(
      'SELECT phone FROM users',
    );
    expect(user.phone).toBe('+5511912345678');
  });
});

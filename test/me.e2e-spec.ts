import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const DAY_MS = 24 * 60 * 60 * 1000;
const UNAUTHORIZED_BODY = { message: 'Sessão inválida ou expirada.' };

interface Owner {
  accessToken: string;
  userId: string;
  barbershopId: string;
}

describe('GET /me (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtSecret: string;
  let ownerA: Owner;
  let ownerB: Owner;

  async function signup(
    email: string,
    barbershopName: string,
    ownerName: string,
    phone: string,
  ): Promise<Owner> {
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        barbershopName,
        ownerName,
        email,
        phone,
        password: 'senha-secreta-123',
      })
      .expect(201);
    const [row] = await dataSource.query<
      { id: string; barbershop_id: string }[]
    >('SELECT id, barbershop_id FROM users WHERE email = $1', [email]);
    return {
      accessToken: (response.body as { accessToken: string }).accessToken,
      userId: row.id,
      barbershopId: row.barbershop_id,
    };
  }

  function getMe() {
    return request(app.getHttpServer()).get('/me');
  }

  beforeAll(async () => {
    ({ app, dataSource } = await createAccountTestApp());
    jwtSecret = app.get(ConfigService).getOrThrow<string>('JWT_SECRET');
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    ownerA = await signup(
      'dono-a@barbearia.com',
      'Barbearia A',
      'Ana Souza',
      '(11) 91234-5678',
    );
    ownerB = await signup(
      'dono-b@barbearia.com',
      'Barbearia B',
      'Bruno Lima',
      '21987654321',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  function expectOwnerA(body: unknown, trialEndsAt: string): void {
    expect(body).toEqual({
      user: {
        id: ownerA.userId,
        name: 'Ana Souza',
        email: 'dono-a@barbearia.com',
        phone: '+5511912345678',
        role: 'owner',
      },
      barbershop: {
        id: ownerA.barbershopId,
        name: 'Barbearia A',
        timezone: 'America/Sao_Paulo',
        subscriptionStatus: 'trialing',
        trialEndsAt,
        suspensionReason: null,
      },
    });
  }

  async function trialOfA(): Promise<{ trialEndsAt: Date; createdAt: Date }> {
    const [row] = await dataSource.query<
      { trial_ends_at: Date; created_at: Date }[]
    >('SELECT trial_ends_at, created_at FROM barbershops WHERE id = $1', [
      ownerA.barbershopId,
    ]);
    return { trialEndsAt: row.trial_ends_at, createdAt: row.created_at };
  }

  it("CA-01.4: returns only A's user and barbershop in trial ending 14 days after signup", async () => {
    const response = await getMe().set(
      'Authorization',
      `Bearer ${ownerA.accessToken}`,
    );

    expect(response.status).toBe(200);
    const { trialEndsAt, createdAt } = await trialOfA();
    expectOwnerA(response.body, trialEndsAt.toISOString());
    const body = response.body as { barbershop: { trialEndsAt: string } };
    expect(
      new Date(body.barbershop.trialEndsAt).getTime() - createdAt.getTime(),
    ).toBe(14 * DAY_MS);
    expect(JSON.stringify(response.body)).not.toContain(ownerB.barbershopId);
  });

  it("CA-01.4: ignores B's barbershopId in query, x-barbershop-id header and body", async () => {
    const { trialEndsAt } = await trialOfA();
    const attempts = [
      () =>
        getMe()
          .query({ barbershopId: ownerB.barbershopId })
          .set('Authorization', `Bearer ${ownerA.accessToken}`),
      () =>
        getMe()
          .set('x-barbershop-id', ownerB.barbershopId)
          .set('Authorization', `Bearer ${ownerA.accessToken}`),
      () =>
        getMe()
          .set('Authorization', `Bearer ${ownerA.accessToken}`)
          .send({ barbershopId: ownerB.barbershopId, userId: ownerB.userId }),
    ];

    for (const attempt of attempts) {
      const response = await attempt();
      expect(response.status).toBe(200);
      expectOwnerA(response.body, trialEndsAt.toISOString());
    }
  });

  it('CA-01.4: responds 401 without a token', async () => {
    const response = await getMe();

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_BODY);
  });

  it.each([
    ['a malformed token', 'Bearer not-a-jwt'],
    ['a non-Bearer scheme', 'Basic dXNlcjpwYXNz'],
  ])('CA-01.4: responds 401 for %s', async (_case, authorization) => {
    const response = await getMe().set('Authorization', authorization);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_BODY);
  });

  it('CA-01.4: responds 401 for a token signed with another secret', async () => {
    const forged = await new JwtService({
      secret: 'outro-segredo-que-nao-e-o-da-aplicacao-123',
    }).signAsync({
      sub: ownerA.userId,
      barbershopId: ownerA.barbershopId,
      role: 'owner',
    });

    const response = await getMe().set('Authorization', `Bearer ${forged}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_BODY);
  });

  it('CA-01.4: responds 401 for an expired token', async () => {
    const expired = await new JwtService({ secret: jwtSecret }).signAsync({
      sub: ownerA.userId,
      barbershopId: ownerA.barbershopId,
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    const response = await getMe().set('Authorization', `Bearer ${expired}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_BODY);
  });
});

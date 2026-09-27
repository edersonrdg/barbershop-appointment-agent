import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import {
  createBarber,
  inviteBarber,
  PASSWORD,
  signupOwner,
} from './support/account-flows';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const OWNER_A = 'dono-a@barbearia.com';
const OWNER_B = 'dono-b@barbearia.com';
const BARBER_A1 = 'joao@exemplo.com';
const BARBER_A2 = 'maria@exemplo.com';
const BARBER_B = 'pedro@exemplo.com';

interface UserRow {
  id: string;
  barbershop_id: string;
  name: string;
  email: string;
  role: string;
}

describe('Listing and removing users (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;
  let ownerAToken: string;
  let barberA1Token: string;

  async function userByEmail(email: string): Promise<UserRow | undefined> {
    const [row] = await dataSource.query<UserRow[]>(
      'SELECT id, barbershop_id, name, email, role FROM users WHERE email = $1',
      [email],
    );
    return row;
  }

  async function countUsers(): Promise<number> {
    const rows = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM users',
    );
    return Number(rows[0].count);
  }

  function removeAsOwnerA(id: string) {
    return request(app.getHttpServer())
      .delete(`/users/${id}`)
      .set('Authorization', `Bearer ${ownerAToken}`);
  }

  beforeAll(async () => {
    ({ app, dataSource, emailSender } = await createAccountTestApp());
    appWebUrl = app.get(ConfigService).getOrThrow<string>('APP_WEB_URL');
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    emailSender.sent.length = 0;
    emailSender.failure = null;
    ({ accessToken: ownerAToken } = await signupOwner(
      app,
      OWNER_A,
      'Barbearia A',
    ));
    const { accessToken: ownerBToken } = await signupOwner(
      app,
      OWNER_B,
      'Barbearia B',
    );
    barberA1Token = await createBarber(
      app,
      emailSender,
      appWebUrl,
      ownerAToken,
      BARBER_A1,
      'João Pereira',
    );
    await createBarber(
      app,
      emailSender,
      appWebUrl,
      ownerAToken,
      BARBER_A2,
      'Maria Souza',
    );
    await createBarber(
      app,
      emailSender,
      appWebUrl,
      ownerBToken,
      BARBER_B,
      'Pedro Lima',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("CA-02.3: GET /users lists every user of the owner's barbershop and none of another (C22)", async () => {
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(response.status).toBe(200);
    const expected = await Promise.all(
      [OWNER_A, BARBER_A1, BARBER_A2].map(async (email) => {
        const row = await userByEmail(email);
        return {
          id: row?.id,
          name: row?.name,
          email: row?.email,
          role: row?.role,
        };
      }),
    );
    const body = response.body as { users: unknown[] };
    expect(Object.keys(body)).toEqual(['users']);
    expect(body.users).toHaveLength(3);
    expect(body.users).toEqual(expect.arrayContaining(expected));
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(OWNER_B);
    expect(serialized).not.toContain(BARBER_B);
  });

  it('CA-02.3: removing a barber responds 204 and keeps the barbershop, the owner and the other barber (C23)', async () => {
    const barber = await userByEmail(BARBER_A1);
    const ownerBefore = await userByEmail(OWNER_A);
    const otherBarberBefore = await userByEmail(BARBER_A2);

    const response = await removeAsOwnerA(barber!.id);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(await userByEmail(BARBER_A1)).toBeUndefined();
    expect(await userByEmail(OWNER_A)).toEqual(ownerBefore);
    expect(await userByEmail(BARBER_A2)).toEqual(otherBarberBefore);
    const barbershops = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM barbershops WHERE id = $1',
      [ownerBefore!.barbershop_id],
    );
    expect(Number(barbershops[0].count)).toBe(1);
  });

  it('CA-02.3: the removed barber gets 401 on the next request with the token issued before (C24)', async () => {
    const barber = await userByEmail(BARBER_A1);
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${barberA1Token}`)
      .expect(200);

    await removeAsOwnerA(barber!.id).expect(204);
    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${barberA1Token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Sessão inválida ou expirada.' });
  });

  it('CA-02.3: the removed barber can no longer log in (C25)', async () => {
    const barber = await userByEmail(BARBER_A1);
    await removeAsOwnerA(barber!.id).expect(204);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: BARBER_A1, password: PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'E-mail ou senha inválidos.' });
  });

  it.each([
    ['a barber of another barbershop', () => userByEmail(BARBER_B)],
    ['the owner of the barbershop', () => userByEmail(OWNER_A)],
    [
      'an id that does not exist',
      () => Promise.resolve({ id: randomUUID() } as UserRow),
    ],
  ])(
    'CA-02.3: removing %s responds 404 and deletes nothing (C26)',
    async (_case, target) => {
      const before = await countUsers();
      const user = await target();

      const response = await removeAsOwnerA(user!.id);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Usuário não encontrado.' });
      expect(await countUsers()).toBe(before);
    },
  );

  it('CA-02.3: a non-uuid id responds 400 with the id field (C27)', async () => {
    const response = await removeAsOwnerA('nao-e-uuid');

    expect(response.status).toBe(400);
    const body = response.body as {
      message: string;
      errors: { field: string }[];
    };
    expect(body.message).toBe('Dados inválidos.');
    expect(body.errors[0].field).toBe('id');
  });

  it("CA-02.3: removal drops the barber's reset tokens and frees the e-mail for a new invitation (C28)", async () => {
    const barber = await userByEmail(BARBER_A1);
    await request(app.getHttpServer())
      .post('/auth/password/forgot')
      .send({ email: BARBER_A1 })
      .expect(202);
    const tokensBefore = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM password_reset_tokens WHERE user_id = $1',
      [barber!.id],
    );
    expect(Number(tokensBefore[0].count)).toBe(1);

    await removeAsOwnerA(barber!.id).expect(204);

    const tokensAfter = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM password_reset_tokens WHERE user_id = $1',
      [barber!.id],
    );
    expect(Number(tokensAfter[0].count)).toBe(0);
    await inviteBarber(app, ownerAToken, {
      email: BARBER_A1,
      name: 'João Pereira',
    }).expect(201);
  });
});

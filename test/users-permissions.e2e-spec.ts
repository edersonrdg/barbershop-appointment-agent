import { randomUUID } from 'node:crypto';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { createBarber, signupOwner } from './support/account-flows';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const OWNER_EMAIL = 'dono@barbearia.com';
const BARBER_EMAIL = 'joao@exemplo.com';
const FORBIDDEN = { message: 'Acesso negado.' };
const UNAUTHORIZED = { message: 'Sessão inválida ou expirada.' };

// An authenticated route with no @Roles, standing in for the routes later
// stories add (settings, reports, subscription).
@Controller('probe-without-roles')
class ProbeController {
  @Get()
  show(): { ok: true } {
    return { ok: true };
  }
}

interface UserRow {
  id: string;
  barbershop_id: string;
}

describe('Role permissions (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;
  let jwtSecret: string;
  let ownerToken: string;
  let barberToken: string;
  let owner: UserRow;
  let barber: UserRow;

  async function userByEmail(email: string): Promise<UserRow> {
    const [row] = await dataSource.query<UserRow[]>(
      'SELECT id, barbershop_id FROM users WHERE email = $1',
      [email],
    );
    return row;
  }

  function sign(sub: string, barbershopId: string, role: string) {
    return new JwtService({ secret: jwtSecret }).signAsync(
      { sub, barbershopId, role },
      { expiresIn: 3600 },
    );
  }

  function withToken(token: string) {
    const server = app.getHttpServer();
    return {
      invite: () =>
        request(server)
          .post('/users/invitations')
          .set('Authorization', `Bearer ${token}`)
          .send({ email: 'novo@exemplo.com', name: 'Novo Barbeiro' }),
      list: () =>
        request(server).get('/users').set('Authorization', `Bearer ${token}`),
      remove: (id: string) =>
        request(server)
          .delete(`/users/${id}`)
          .set('Authorization', `Bearer ${token}`),
      me: () =>
        request(server).get('/me').set('Authorization', `Bearer ${token}`),
      probe: () =>
        request(server)
          .get('/probe-without-roles')
          .set('Authorization', `Bearer ${token}`),
    };
  }

  beforeAll(async () => {
    ({ app, dataSource, emailSender } = await createAccountTestApp([
      ProbeController,
    ]));
    const config = app.get(ConfigService);
    appWebUrl = config.getOrThrow<string>('APP_WEB_URL');
    jwtSecret = config.getOrThrow<string>('JWT_SECRET');
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    emailSender.sent.length = 0;
    ({ accessToken: ownerToken } = await signupOwner(app, OWNER_EMAIL));
    barberToken = await createBarber(
      app,
      emailSender,
      appWebUrl,
      ownerToken,
      BARBER_EMAIL,
    );
    owner = await userByEmail(OWNER_EMAIL);
    barber = await userByEmail(BARBER_EMAIL);
  });

  afterAll(async () => {
    await app.close();
  });

  it('CA-02.2: a barber gets 403 on invite, list and remove, and nothing changes (C16)', async () => {
    const asBarber = withToken(barberToken);
    const invitationsBefore = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM user_invitations',
    );

    for (const response of [
      await asBarber.invite(),
      await asBarber.list(),
      await asBarber.remove(owner.id),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN);
    }

    const invitationsAfter = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM user_invitations',
    );
    expect(invitationsAfter[0].count).toBe(invitationsBefore[0].count);
    expect(await userByEmail(OWNER_EMAIL)).toEqual(owner);
  });

  it('CA-02.2: a route without @Roles answers 403 to a barber and 200 to the owner (C17)', async () => {
    const asBarber = await withToken(barberToken).probe();
    expect(asBarber.status).toBe(403);
    expect(asBarber.body).toEqual(FORBIDDEN);

    const asOwner = await withToken(ownerToken).probe();
    expect(asOwner.status).toBe(200);
    expect(asOwner.body).toEqual({ ok: true });
  });

  it('CA-02.2: the role stored for the user wins over the role in the token (C19)', async () => {
    const barberClaimingOwner = await sign(
      barber.id,
      barber.barbershop_id,
      'owner',
    );
    const denied = await withToken(barberClaimingOwner).list();
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual(FORBIDDEN);

    const ownerClaimingBarber = await sign(
      owner.id,
      owner.barbershop_id,
      'barber',
    );
    const allowed = await withToken(ownerClaimingBarber).list();
    expect(allowed.status).toBe(200);
  });

  it('CA-02.2: a token with a role other than owner or barber gets 401 (C20)', async () => {
    const admin = await sign(owner.id, owner.barbershop_id, 'admin');

    const response = await withToken(admin).me();

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED);
  });

  it('CA-02.2: the new user routes answer 401 without a session (C21)', async () => {
    const server = app.getHttpServer();

    for (const response of [
      await request(server)
        .post('/users/invitations')
        .send({ email: 'novo@exemplo.com', name: 'Novo Barbeiro' }),
      await request(server).get('/users'),
      await request(server).delete(`/users/${randomUUID()}`),
    ]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual(UNAUTHORIZED);
    }
  });

  it('CA-02.2: a barber still reads its own account on GET /me', async () => {
    const response = await withToken(barberToken).me();

    expect(response.status).toBe(200);
    expect((response.body as { user: { id: string } }).user.id).toBe(barber.id);
  });
});

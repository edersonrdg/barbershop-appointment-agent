import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import {
  acceptInvitation,
  invitationTokenFromLastEmail,
  inviteBarber,
  signupOwner,
} from './support/account-flows';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const DAY_MS = 24 * 60 * 60 * 1000;
const OWNER_EMAIL = 'dono@barbearia.com';
const BARBER_EMAIL = 'joao@exemplo.com';
const BARBER_PASSWORD = 'senha-do-joao';
const INVITE = { email: BARBER_EMAIL, name: 'João Pereira' };
const EMAIL_TAKEN = { message: 'Este e-mail já está cadastrado.' };
const INVALID_INVITATION = { message: 'Convite inválido ou expirado.' };

interface InvitationRow {
  id: string;
  barbershop_id: string;
  token_hash: string;
  accepted_at: Date | null;
  created_at: Date;
}

describe('Barber invitations (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;
  let sessionTtlSeconds: number;
  let ownerToken: string;

  async function invitations(): Promise<InvitationRow[]> {
    return dataSource.query<InvitationRow[]>(
      'SELECT id, barbershop_id, token_hash, accepted_at, created_at FROM user_invitations ORDER BY created_at',
    );
  }

  async function countUsers(email?: string): Promise<number> {
    const rows = email
      ? await dataSource.query<{ count: string }[]>(
          'SELECT count(*) FROM users WHERE email = $1',
          [email],
        )
      : await dataSource.query<{ count: string }[]>(
          'SELECT count(*) FROM users',
        );
    return Number(rows[0].count);
  }

  async function ownerBarbershopId(): Promise<string> {
    const [row] = await dataSource.query<{ barbershop_id: string }[]>(
      'SELECT barbershop_id FROM users WHERE email = $1',
      [OWNER_EMAIL],
    );
    return row.barbershop_id;
  }

  async function inviteAndGetToken(): Promise<string> {
    await inviteBarber(app, ownerToken, INVITE).expect(201);
    return invitationTokenFromLastEmail(emailSender, appWebUrl);
  }

  beforeAll(async () => {
    ({ app, dataSource, emailSender } = await createAccountTestApp());
    const config = app.get(ConfigService);
    appWebUrl = config.getOrThrow<string>('APP_WEB_URL');
    sessionTtlSeconds = Number(
      config.getOrThrow<number>('AUTH_SESSION_TTL_SECONDS'),
    );
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    emailSender.sent.length = 0;
    emailSender.failure = null;
    ({ accessToken: ownerToken } = await signupOwner(app, OWNER_EMAIL));
  });

  afterAll(async () => {
    await app.close();
  });

  it('CA-02.1: responds 201 with the invitation, normalized e-mail and 7-day expiry, without the token (C1)', async () => {
    const response = await inviteBarber(app, ownerToken, {
      email: '  Joao@Exemplo.com ',
      name: 'João Pereira',
    });

    expect(response.status).toBe(201);
    const [row] = await invitations();
    expect(response.body).toEqual({
      id: row.id,
      email: BARBER_EMAIL,
      name: 'João Pereira',
      expiresAt: new Date(row.created_at.getTime() + 7 * DAY_MS).toISOString(),
    });
    expect(response.body).not.toHaveProperty('token');
  });

  it('CA-02.1: e-mails the invited address a link whose token hashes to the stored token_hash (C3)', async () => {
    await inviteBarber(app, ownerToken, INVITE).expect(201);

    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe(BARBER_EMAIL);
    const token = invitationTokenFromLastEmail(emailSender, appWebUrl);
    expect(emailSender.sent[0].text).toContain(
      `${appWebUrl}/aceitar-convite?token=${token}`,
    );
    const [row] = await invitations();
    expect(row.token_hash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });

  it('CA-02.1: accepting responds 201 with a Bearer session and marks the invitation accepted (C4)', async () => {
    const token = await inviteAndGetToken();

    const response = await acceptInvitation(app, {
      token,
      password: BARBER_PASSWORD,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accessToken: expect.any(String) as unknown,
      tokenType: 'Bearer',
      expiresIn: sessionTtlSeconds,
    });
    const [row] = await invitations();
    expect(row.accepted_at).not.toBeNull();
  });

  it('CA-02.1: the accepted session sees itself as a barber of the inviting barbershop with no phone (C5)', async () => {
    const token = await inviteAndGetToken();
    const accepted = await acceptInvitation(app, {
      token,
      password: BARBER_PASSWORD,
    }).expect(201);

    const response = await request(app.getHttpServer())
      .get('/me')
      .set(
        'Authorization',
        `Bearer ${(accepted.body as { accessToken: string }).accessToken}`,
      );

    expect(response.status).toBe(200);
    const body = response.body as {
      user: Record<string, unknown>;
      barbershop: { id: string };
    };
    expect(body.user).toEqual({
      id: expect.any(String) as unknown,
      name: 'João Pereira',
      email: BARBER_EMAIL,
      phone: null,
      role: 'barber',
    });
    expect(body.barbershop.id).toBe(await ownerBarbershopId());
  });

  it('CA-02.1: the barber logs in with the invited e-mail and the chosen password (C6)', async () => {
    const token = await inviteAndGetToken();
    await acceptInvitation(app, { token, password: BARBER_PASSWORD }).expect(
      201,
    );

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: BARBER_EMAIL, password: BARBER_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accessToken: expect.any(String) as unknown,
      tokenType: 'Bearer',
      expiresIn: sessionTtlSeconds,
    });
  });

  it.each([
    ['the owner of this barbershop', OWNER_EMAIL],
    ['the owner of another barbershop', 'dono-b@barbearia.com'],
  ])(
    'CA-02.1: responds 409 when inviting the e-mail of %s, storing and sending nothing (C7)',
    async (_case, email) => {
      await signupOwner(app, 'dono-b@barbearia.com', 'Barbearia B');

      const response = await inviteBarber(app, ownerToken, {
        email,
        name: 'Alguém',
      });

      expect(response.status).toBe(409);
      expect(response.body).toEqual(EMAIL_TAKEN);
      expect(await invitations()).toHaveLength(0);
      expect(emailSender.sent).toHaveLength(0);
    },
  );

  it.each([
    ['unknown', () => Promise.resolve('token-que-nao-existe-em-lugar-nenhum')],
    [
      'already accepted',
      async () => {
        const token = await inviteAndGetToken();
        await acceptInvitation(app, {
          token,
          password: BARBER_PASSWORD,
        }).expect(201);
        return token;
      },
    ],
    [
      'expired',
      async () => {
        const token = await inviteAndGetToken();
        await dataSource.query(
          "UPDATE user_invitations SET expires_at = now() - interval '1 minute'",
        );
        return token;
      },
    ],
    [
      'replaced by a new invitation',
      async () => {
        const token = await inviteAndGetToken();
        await inviteBarber(app, ownerToken, INVITE).expect(201);
        return token;
      },
    ],
  ])(
    'CA-02.1: responds 400 for an %s token and creates no user (C8)',
    async (_case, tokenFor) => {
      const token = await tokenFor();
      const usersBefore = await countUsers();

      const response = await acceptInvitation(app, {
        token,
        password: 'outra-senha-123',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_INVITATION);
      expect(await countUsers()).toBe(usersBefore);
    },
  );

  it('CA-02.1: responds 409 when the e-mail was registered between invite and accept, keeping the invitation pending (C9)', async () => {
    const token = await inviteAndGetToken();
    await signupOwner(app, BARBER_EMAIL, 'Barbearia do João');

    const response = await acceptInvitation(app, {
      token,
      password: BARBER_PASSWORD,
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(EMAIL_TAKEN);
    const barbers = await dataSource.query<{ count: string }[]>(
      "SELECT count(*) FROM users WHERE role = 'barber'",
    );
    expect(Number(barbers[0].count)).toBe(0);
    const [row] = await invitations();
    expect(row.accepted_at).toBeNull();
  });

  it('CA-02.1: inviting the same e-mail again leaves one pending invitation, and its token is accepted (C10)', async () => {
    await inviteAndGetToken();
    const secondToken = await inviteAndGetToken();

    const pending = await dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM user_invitations WHERE barbershop_id = $1 AND email = $2 AND accepted_at IS NULL',
      [await ownerBarbershopId(), BARBER_EMAIL],
    );
    expect(Number(pending[0].count)).toBe(1);

    await acceptInvitation(app, {
      token: secondToken,
      password: BARBER_PASSWORD,
    }).expect(201);
  });

  it('CA-02.1: two concurrent accepts of the same token create exactly one user (C11)', async () => {
    const token = await inviteAndGetToken();

    const responses = await Promise.all([
      acceptInvitation(app, { token, password: BARBER_PASSWORD }),
      acceptInvitation(app, { token, password: BARBER_PASSWORD }),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);
    expect(await countUsers(BARBER_EMAIL)).toBe(1);
  });

  it('CA-02.1: responds 502 when the invitation e-mail cannot be sent, keeping the invitation (C12)', async () => {
    emailSender.failure = new Error('smtp down');

    const response = await inviteBarber(app, ownerToken, INVITE);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      message: 'Não foi possível enviar o convite. Tente novamente.',
    });
    expect(await invitations()).toHaveLength(1);
  });

  it.each([
    ['invite', 'email', { email: 'nao-e-email', name: 'João Pereira' }],
    ['invite', 'name', { email: BARBER_EMAIL, name: 'J' }],
    ['invite', 'name', { email: BARBER_EMAIL, name: 'J'.repeat(101) }],
    ['invite', 'name', { email: BARBER_EMAIL, name: '   a  ' }],
    ['accept', 'token', { password: BARBER_PASSWORD }],
    ['accept', 'password', { token: 'qualquer', password: 'a'.repeat(7) }],
    ['accept', 'password', { token: 'qualquer', password: 'a'.repeat(73) }],
  ])(
    'CA-02.1: %s with an invalid %s responds 400 and stores nothing (C13)',
    async (route, field, body) => {
      const usersBefore = await countUsers();

      const response =
        route === 'invite'
          ? await inviteBarber(app, ownerToken, body)
          : await acceptInvitation(app, body);

      expect(response.status).toBe(400);
      const responseBody = response.body as {
        message: string;
        errors: { field: string }[];
      };
      expect(responseBody.message).toBe('Dados inválidos.');
      expect(responseBody.errors.map((error) => error.field)).toContain(field);
      expect(await invitations()).toHaveLength(0);
      expect(await countUsers()).toBe(usersBefore);
    },
  );

  it('CA-02.1: accepts names of exactly 2 and 100 characters', async () => {
    await inviteBarber(app, ownerToken, {
      email: 'curto@exemplo.com',
      name: 'Jo',
    }).expect(201);
    await inviteBarber(app, ownerToken, {
      email: 'longo@exemplo.com',
      name: 'J'.repeat(100),
    }).expect(201);
  });
});

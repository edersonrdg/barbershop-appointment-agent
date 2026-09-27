import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const EMAIL = 'dono@barbearia.com';
const PASSWORD = 'senha-secreta-123';
const FORGOT_BODY = {
  message:
    'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.',
};

describe('Password reset (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;

  function forgot(email: string) {
    return request(app.getHttpServer())
      .post('/auth/password/forgot')
      .send({ email });
  }

  function reset(token: string, newPassword: string) {
    return request(app.getHttpServer())
      .post('/auth/password/reset')
      .send({ token, newPassword });
  }

  function login(password: string) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: EMAIL, password });
  }

  async function passwordHash(): Promise<string> {
    const [row] = await dataSource.query<{ password_hash: string }[]>(
      'SELECT password_hash FROM users',
    );
    return row.password_hash;
  }

  function tokenFromLastEmail(): string {
    const text = emailSender.sent[emailSender.sent.length - 1].text;
    const escapedUrl = appWebUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(
      `${escapedUrl}/redefinir-senha\\?token=([A-Za-z0-9_-]+)`,
    ).exec(text);
    if (!match) throw new Error('reset link not found in the e-mail');
    return match[1];
  }

  async function tokenHashes(): Promise<string[]> {
    const rows = await dataSource.query<{ token_hash: string }[]>(
      'SELECT token_hash FROM password_reset_tokens',
    );
    return rows.map((row) => row.token_hash);
  }

  beforeAll(async () => {
    ({ app, dataSource, emailSender } = await createAccountTestApp());
    appWebUrl = app.get(ConfigService).getOrThrow<string>('APP_WEB_URL');
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    emailSender.sent.length = 0;
    emailSender.failure = null;
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

  describe('POST /auth/password/forgot', () => {
    it('CA-01.5: responds 202 and e-mails the reset link to an existing user', async () => {
      const response = await forgot(EMAIL);

      expect(response.status).toBe(202);
      expect(response.body).toEqual(FORGOT_BODY);
      expect(emailSender.sent).toHaveLength(1);
      expect(emailSender.sent[0].to).toBe(EMAIL);
      expect(emailSender.sent[0].subject).toBe('Redefinição de senha');
      expect(emailSender.sent[0].text).toContain(
        `${appWebUrl}/redefinir-senha?token=${tokenFromLastEmail()}`,
      );
    });

    it('CA-01.5: responds 202 with the identical body and sends no e-mail for an unknown e-mail', async () => {
      const response = await forgot('ninguem@barbearia.com');

      expect(response.status).toBe(202);
      expect(response.body).toEqual(FORGOT_BODY);
      expect(emailSender.sent).toHaveLength(0);
      expect(await tokenHashes()).toEqual([]);
    });

    it('CA-01.5: responds 202 with the identical body when sending the e-mail fails', async () => {
      emailSender.failure = new Error('SMTP indisponível');

      const response = await forgot(EMAIL);

      expect(response.status).toBe(202);
      expect(response.body).toEqual(FORGOT_BODY);
      expect(emailSender.sent).toHaveLength(0);
      expect(await tokenHashes()).toHaveLength(1);
    });

    it('CA-01.5: stores only the SHA-256 of the link token', async () => {
      await forgot(EMAIL).expect(202);
      const token = tokenFromLastEmail();

      const hashes = await tokenHashes();
      expect(hashes).toEqual([
        createHash('sha256').update(token).digest('hex'),
      ]);
      expect(hashes[0]).not.toContain(token);
    });
  });

  describe('POST /auth/password/reset', () => {
    const NEW_PASSWORD = 'nova-senha-456';
    const INVALID_LINK_BODY = {
      message: 'Link de redefinição inválido ou expirado.',
    };

    async function requestToken(): Promise<string> {
      await forgot(EMAIL).expect(202);
      return tokenFromLastEmail();
    }

    async function expectPasswordUnchanged(hashBefore: string): Promise<void> {
      expect(await passwordHash()).toBe(hashBefore);
      expect((await login(PASSWORD)).status).toBe(200);
      expect((await login(NEW_PASSWORD)).status).toBe(401);
    }

    it('CA-01.5: responds 204 for the link token and a valid password; login accepts only the new one', async () => {
      const token = await requestToken();

      const response = await reset(token, NEW_PASSWORD);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect((await login(NEW_PASSWORD)).status).toBe(200);
      const oldLogin = await login(PASSWORD);
      expect(oldLogin.status).toBe(401);
      expect(oldLogin.body).toEqual({ message: 'E-mail ou senha inválidos.' });
    });

    it('CA-01.5: rejects the same token a second time with 400', async () => {
      const token = await requestToken();
      await reset(token, NEW_PASSWORD).expect(204);
      const hashAfterFirstReset = await passwordHash();

      const response = await reset(token, 'terceira-senha-789');

      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_LINK_BODY);
      expect(await passwordHash()).toBe(hashAfterFirstReset);
    });

    it('CA-01.5: rejects a token superseded by a newer request with 400 and keeps the password', async () => {
      const oldToken = await requestToken();
      await requestToken();
      const hashBefore = await passwordHash();

      const response = await reset(oldToken, NEW_PASSWORD);

      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_LINK_BODY);
      await expectPasswordUnchanged(hashBefore);
    });

    it('CA-01.5: rejects an unknown token with 400 and keeps the password', async () => {
      const hashBefore = await passwordHash();

      const response = await reset('token-que-nao-existe', NEW_PASSWORD);

      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_LINK_BODY);
      await expectPasswordUnchanged(hashBefore);
    });

    it('CA-01.5: rejects an expired token with 400 and keeps the password', async () => {
      const token = await requestToken();
      await dataSource.query(
        "UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'",
      );
      const hashBefore = await passwordHash();

      const response = await reset(token, NEW_PASSWORD);

      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_LINK_BODY);
      await expectPasswordUnchanged(hashBefore);
    });

    it('CA-01.5: rejects an invalid new password with 400 without consuming the token', async () => {
      const token = await requestToken();
      const hashBefore = await passwordHash();

      const response = await reset(token, 'curta');

      expect(response.status).toBe(400);
      const body = response.body as {
        message: string;
        errors: { field: string }[];
      };
      expect(body.message).toBe('Dados inválidos.');
      expect(body.errors.map((error) => error.field)).toEqual(['newPassword']);
      expect(await passwordHash()).toBe(hashBefore);
      const usedAt = await dataSource.query<{ used_at: Date | null }[]>(
        'SELECT used_at FROM password_reset_tokens',
      );
      expect(usedAt).toEqual([{ used_at: null }]);

      await reset(token, NEW_PASSWORD).expect(204);
      expect((await login(NEW_PASSWORD)).status).toBe(200);
    });
  });
});

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
});

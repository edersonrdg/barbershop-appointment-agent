import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { createBarber, signupOwner } from './support/account-flows';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const FORBIDDEN = { message: 'Acesso negado.' };
const UNAUTHORIZED = { message: 'Sessão inválida ou expirada.' };

const ALL_CLOSED = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

describe('/settings/barbershop (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;
  let ownerToken: string;

  function getSettings(token?: string) {
    const call = request(app.getHttpServer()).get('/settings/barbershop');
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  beforeAll(async () => {
    ({ app, dataSource, emailSender } = await createAccountTestApp());
    appWebUrl = app.get(ConfigService).getOrThrow<string>('APP_WEB_URL');
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    emailSender.sent.length = 0;
    ({ accessToken: ownerToken } = await signupOwner(
      app,
      'dono@barbearia.com',
      'Barbearia do Zé',
    ));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET', () => {
    it('CA-03.1: a new owner gets the name, no address, America/Sao_Paulo and all 7 days closed', async () => {
      const response = await getSettings(ownerToken);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        name: 'Barbearia do Zé',
        address: null,
        timezone: 'America/Sao_Paulo',
        openingHours: ALL_CLOSED,
      });
    });

    it('CA-03.1: a barber gets 403', async () => {
      const barberToken = await createBarber(
        app,
        emailSender,
        appWebUrl,
        ownerToken,
        'joao@exemplo.com',
      );

      const response = await getSettings(barberToken);

      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN);
    });

    it('CA-03.1: a request without a session gets 401', async () => {
      const response = await getSettings();

      expect(response.status).toBe(401);
      expect(response.body).toEqual(UNAUTHORIZED);
    });
  });
});

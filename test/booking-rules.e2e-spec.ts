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

const DEFAULT_RULES = {
  minimumAdvanceMinutes: 60,
  cancellationDeadlineMinutes: 120,
  noShowLimit: 2,
  waitlistOfferMinutes: 15,
  returnReminderDays: 30,
};

const NEW_RULES = {
  minimumAdvanceMinutes: 30,
  cancellationDeadlineMinutes: 240,
  noShowLimit: 3,
  waitlistOfferMinutes: 20,
  returnReminderDays: 45,
};

const SETTINGS = {
  name: 'Barbearia do Zé',
  address: 'Rua das Flores, 123 - Centro, Campinas/SP',
  timezone: 'America/Manaus',
  openingHours: {
    monday: {
      opensAt: '09:00',
      closesAt: '19:00',
      break: { startsAt: '12:00', endsAt: '13:00' },
    },
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  },
};

function barbershopIdOf(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as { barbershopId: string };
  return payload.barbershopId;
}

describe('/settings/rules (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;
  let ownerToken: string;

  function getRules(token?: string) {
    const call = request(app.getHttpServer()).get('/settings/rules');
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function putRules(token: string | undefined, body: unknown) {
    const call = request(app.getHttpServer()).put('/settings/rules');
    return (token ? call.set('Authorization', `Bearer ${token}`) : call).send(
      body as object,
    );
  }

  async function currentRules(token = ownerToken): Promise<unknown> {
    return (await getRules(token).expect(200)).body;
  }

  function barberToken(): Promise<string> {
    return createBarber(
      app,
      emailSender,
      appWebUrl,
      ownerToken,
      'joao@exemplo.com',
    );
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
    ));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET', () => {
    it('CA-06.1: a new barbershop gets 60 min, 120 min, 2 no-shows, 15 min and 30 days', async () => {
      const response = await getRules(ownerToken);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(DEFAULT_RULES);
    });

    it('CA-06.1: a barber gets 403', async () => {
      const response = await getRules(await barberToken());

      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN);
    });

    it('CA-06.1: a request without a session gets 401', async () => {
      const response = await getRules();

      expect(response.status).toBe(401);
      expect(response.body).toEqual(UNAUTHORIZED);
    });
  });

  describe('PUT', () => {
    it('CA-06.2: saves the five rules, answers 200 with them and GET returns the same', async () => {
      const response = await putRules(ownerToken, NEW_RULES);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(NEW_RULES);
      expect(await currentRules()).toEqual(NEW_RULES);
    });

    it('CA-06.2: accepts and saves 0 for minimum advance and cancellation deadline', async () => {
      const zeros = {
        ...NEW_RULES,
        minimumAdvanceMinutes: 0,
        cancellationDeadlineMinutes: 0,
      };

      const response = await putRules(ownerToken, zeros);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(zeros);
      expect(await currentRules()).toEqual(zeros);
    });

    it('CA-06.2: accepts every exact upper limit', async () => {
      const upper = {
        minimumAdvanceMinutes: 10080,
        cancellationDeadlineMinutes: 10080,
        noShowLimit: 10,
        waitlistOfferMinutes: 120,
        returnReminderDays: 365,
      };

      await putRules(ownerToken, upper).expect(200);

      expect(await currentRules()).toEqual(upper);
    });

    it('CA-06.2: accepts every exact lower limit', async () => {
      const lower = {
        minimumAdvanceMinutes: 0,
        cancellationDeadlineMinutes: 0,
        noShowLimit: 1,
        waitlistOfferMinutes: 5,
        returnReminderDays: 7,
      };

      await putRules(ownerToken, lower).expect(200);

      expect(await currentRules()).toEqual(lower);
    });

    it('CA-06.2: repeating the same PUT answers 200 and ends in the same state', async () => {
      await putRules(ownerToken, NEW_RULES).expect(200);

      const second = await putRules(ownerToken, NEW_RULES);

      expect(second.status).toBe(200);
      expect(second.body).toEqual(NEW_RULES);
      expect(await currentRules()).toEqual(NEW_RULES);
    });

    it('CA-06.2: leaves name, address, timezone and opening hours of the barbershop unchanged', async () => {
      await request(app.getHttpServer())
        .put('/settings/barbershop')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(SETTINGS)
        .expect(200);

      await putRules(ownerToken, NEW_RULES).expect(200);

      const settings = await request(app.getHttpServer())
        .get('/settings/barbershop')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(settings.body).toEqual(SETTINGS);
    });

    describe('CA-06.3: invalid values', () => {
      beforeEach(async () => {
        await putRules(ownerToken, NEW_RULES).expect(200);
      });

      it('rejects a negative noShowLimit with 400 on the field and changes nothing', async () => {
        const response = await putRules(ownerToken, {
          ...DEFAULT_RULES,
          noShowLimit: -1,
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          message: 'Dados inválidos.',
          errors: [
            {
              field: 'noShowLimit',
              message: 'Informe o limite de faltas, de 1 a 10.',
            },
          ],
        });
        expect(await currentRules()).toEqual(NEW_RULES);
      });

      it('rejects a missing returnReminderDays with 400 on the field and changes nothing', async () => {
        const body: Record<string, number> = { ...DEFAULT_RULES };
        delete body.returnReminderDays;

        const response = await putRules(ownerToken, body);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          message: 'Dados inválidos.',
          errors: [
            {
              field: 'returnReminderDays',
              message:
                'Informe os dias para o lembrete de retorno, de 7 a 365.',
            },
          ],
        });
        expect(await currentRules()).toEqual(NEW_RULES);
      });

      it('rejects an empty minimumAdvanceMinutes with 400 on the field and changes nothing', async () => {
        const response = await putRules(ownerToken, {
          ...DEFAULT_RULES,
          minimumAdvanceMinutes: '',
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          message: 'Dados inválidos.',
          errors: [
            {
              field: 'minimumAdvanceMinutes',
              message:
                'Informe a antecedência mínima em minutos, de 0 a 10080, em múltiplos de 5.',
            },
          ],
        });
        expect(await currentRules()).toEqual(NEW_RULES);
      });

      it('rejects a numeric string without converting it', async () => {
        const response = await putRules(ownerToken, {
          ...DEFAULT_RULES,
          cancellationDeadlineMinutes: '60',
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          message: 'Dados inválidos.',
          errors: [
            {
              field: 'cancellationDeadlineMinutes',
              message:
                'Informe o prazo de cancelamento em minutos, de 0 a 10080, em múltiplos de 5.',
            },
          ],
        });
        expect(await currentRules()).toEqual(NEW_RULES);
      });

      it('rejects a value one step beyond the limit and keeps the other valid fields unsaved', async () => {
        const response = await putRules(ownerToken, {
          ...DEFAULT_RULES,
          waitlistOfferMinutes: 121,
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          message: 'Dados inválidos.',
          errors: [
            {
              field: 'waitlistOfferMinutes',
              message:
                'Informe o prazo da oferta da lista de espera em minutos, de 5 a 120.',
            },
          ],
        });
        expect(await currentRules()).toEqual(NEW_RULES);
      });
    });

    it('CA-06.2: a barber gets 403 and the rules stay unchanged', async () => {
      const response = await putRules(await barberToken(), NEW_RULES);

      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN);
      expect(await currentRules()).toEqual(DEFAULT_RULES);
    });

    it('CA-06.2: a request without a session gets 401 and the rules stay unchanged', async () => {
      const response = await putRules(undefined, NEW_RULES);

      expect(response.status).toBe(401);
      expect(response.body).toEqual(UNAUTHORIZED);
      expect(await currentRules()).toEqual(DEFAULT_RULES);
    });

    it('RN-26: the PUT of A changes only A, even with the id of B in body, query and header', async () => {
      const { accessToken: otherToken } = await signupOwner(
        app,
        'outro@barbearia.com',
        'Barbearia B',
      );
      const otherId = barbershopIdOf(otherToken);

      const response = await request(app.getHttpServer())
        .put(`/settings/rules?barbershopId=${otherId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-barbershop-id', otherId)
        .send({ ...NEW_RULES, barbershopId: otherId });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(NEW_RULES);
      expect(await currentRules()).toEqual(NEW_RULES);
      expect(await currentRules(otherToken)).toEqual(DEFAULT_RULES);
    });
  });
});

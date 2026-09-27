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

const SETTINGS = {
  name: 'Barbearia do Zé',
  address: 'Rua das Flores, 123 - Centro, Campinas/SP',
  timezone: 'America/Sao_Paulo',
  openingHours: {
    ...ALL_CLOSED,
    monday: {
      opensAt: '09:00',
      closesAt: '19:00',
      break: { startsAt: '12:00', endsAt: '13:00' },
    },
    tuesday: { opensAt: '09:00', closesAt: '19:00', break: null },
  },
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

  function putSettings(token: string | undefined, body: unknown) {
    const call = request(app.getHttpServer()).put('/settings/barbershop');
    return (token ? call.set('Authorization', `Bearer ${token}`) : call).send(
      body as object,
    );
  }

  async function currentSettings(token = ownerToken): Promise<unknown> {
    return (await getSettings(token).expect(200)).body;
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

  describe('PUT', () => {
    it('CA-03.1: saves name, address, timezone and week, answers 200 with the saved state and GET returns the same', async () => {
      const response = await putSettings(ownerToken, SETTINGS);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(SETTINGS);
      expect(await currentSettings()).toEqual(SETTINGS);
    });

    it('CA-03.1: an open day sent without break is returned with break: null', async () => {
      const response = await putSettings(ownerToken, {
        ...SETTINGS,
        openingHours: {
          ...ALL_CLOSED,
          friday: { opensAt: '10:00', closesAt: '18:00' },
        },
      });

      const expected = {
        ...SETTINGS,
        openingHours: {
          ...ALL_CLOSED,
          friday: { opensAt: '10:00', closesAt: '18:00', break: null },
        },
      };
      expect(response.status).toBe(200);
      expect(response.body).toEqual(expected);
      expect(await currentSettings()).toEqual(expected);
    });

    it('CA-03.1: repeating the same PUT answers 200 and ends in the same state', async () => {
      await putSettings(ownerToken, SETTINGS).expect(200);

      const second = await putSettings(ownerToken, SETTINGS);

      expect(second.status).toBe(200);
      expect(second.body).toEqual(SETTINGS);
      expect(await currentSettings()).toEqual(SETTINGS);
    });

    it('CA-03.1: a day that was open and is sent as null becomes closed', async () => {
      await putSettings(ownerToken, SETTINGS).expect(200);

      await putSettings(ownerToken, {
        ...SETTINGS,
        openingHours: { ...SETTINGS.openingHours, monday: null },
      }).expect(200);

      expect(await currentSettings()).toEqual({
        ...SETTINGS,
        openingHours: { ...SETTINGS.openingHours, monday: null },
      });
    });

    it('CA-03.1: trims name and address, and accepts all 7 days closed', async () => {
      const response = await putSettings(ownerToken, {
        ...SETTINGS,
        name: '  Barbearia Nova  ',
        address: '  Rua Nova, 10  ',
        openingHours: ALL_CLOSED,
      });

      const expected = {
        ...SETTINGS,
        name: 'Barbearia Nova',
        address: 'Rua Nova, 10',
        openingHours: ALL_CLOSED,
      };
      expect(response.status).toBe(200);
      expect(response.body).toEqual(expected);
      expect(await currentSettings()).toEqual(expected);
    });

    describe('CA-03.2: incoherent opening hours', () => {
      beforeEach(async () => {
        await putSettings(ownerToken, SETTINGS).expect(200);
      });

      it('rejects monday 18:00-09:00 with 400 and the day in the message, changing nothing', async () => {
        const response = await putSettings(ownerToken, {
          ...SETTINGS,
          name: 'Nome Que Não Pode Ficar',
          openingHours: {
            ...SETTINGS.openingHours,
            monday: { opensAt: '18:00', closesAt: '09:00', break: null },
          },
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          message:
            'Segunda-feira: o horário de fechamento deve ser depois do de abertura.',
        });
        expect(await currentSettings()).toEqual(SETTINGS);
      });

      it('rejects a break outside the opening hours with 400, changing nothing', async () => {
        const response = await putSettings(ownerToken, {
          ...SETTINGS,
          openingHours: {
            ...SETTINGS.openingHours,
            tuesday: {
              opensAt: '09:00',
              closesAt: '19:00',
              break: { startsAt: '18:00', endsAt: '20:00' },
            },
          },
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          message:
            'Terça-feira: o intervalo deve começar e terminar dentro do horário de funcionamento, com o fim depois do início.',
        });
        expect(await currentSettings()).toEqual(SETTINGS);
      });

      it('rejects a malformed payload with 400 listing the invalid fields, changing nothing', async () => {
        const withoutSunday: Record<string, unknown> = {
          ...SETTINGS.openingHours,
        };
        delete withoutSunday.sunday;

        const response = await putSettings(ownerToken, {
          ...SETTINGS,
          address: 'Rua',
          openingHours: {
            ...withoutSunday,
            monday: { opensAt: '25:00', closesAt: '19:00', break: null },
          },
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          message: 'Dados inválidos.',
          errors: [
            {
              field: 'address',
              message:
                'Informe o endereço da barbearia, com 5 a 200 caracteres.',
            },
            {
              field: 'openingHours.monday.opensAt',
              message:
                'Informe o horário no formato HH:mm, entre 00:00 e 23:59.',
            },
            {
              field: 'openingHours.sunday',
              message:
                'Informe o horário do dia, ou null se a barbearia fica fechada.',
            },
          ],
        });
        expect(await currentSettings()).toEqual(SETTINGS);
      });
    });

    describe('CA-03.3: timezone', () => {
      it('saves America/Manaus and returns it on GET /settings/barbershop and GET /me', async () => {
        await putSettings(ownerToken, {
          ...SETTINGS,
          timezone: 'America/Manaus',
        }).expect(200);

        expect(await currentSettings()).toEqual({
          ...SETTINGS,
          timezone: 'America/Manaus',
        });
        const me = await request(app.getHttpServer())
          .get('/me')
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);
        expect(
          (me.body as { barbershop: { timezone: string } }).barbershop.timezone,
        ).toBe('America/Manaus');
      });

      it('rejects Europe/Lisbon with 400 on the timezone field, changing nothing', async () => {
        await putSettings(ownerToken, SETTINGS).expect(200);

        const response = await putSettings(ownerToken, {
          ...SETTINGS,
          timezone: 'Europe/Lisbon',
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          message: 'Dados inválidos.',
          errors: [
            {
              field: 'timezone',
              message: 'Escolha um fuso horário do Brasil.',
            },
          ],
        });
        expect(await currentSettings()).toEqual(SETTINGS);
      });
    });

    describe('permissions and tenant', () => {
      it('RN-26: a PUT from A carrying the id of B in body, query and header changes only A', async () => {
        const { accessToken: tokenB } = await signupOwner(
          app,
          'dono@barbearia-b.com',
          'Barbearia B',
        );
        const [rowB] = await dataSource.query<{ id: string }[]>(
          "SELECT id FROM barbershops WHERE name = 'Barbearia B'",
        );
        const settingsBBefore = await currentSettings(tokenB);

        const response = await request(app.getHttpServer())
          .put(`/settings/barbershop?barbershopId=${rowB.id}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .set('x-barbershop-id', rowB.id)
          .send({
            ...SETTINGS,
            name: 'Barbearia A Nova',
            barbershopId: rowB.id,
          });

        expect(response.status).toBe(200);
        expect(await currentSettings()).toEqual({
          ...SETTINGS,
          name: 'Barbearia A Nova',
        });
        expect(await currentSettings(tokenB)).toEqual(settingsBBefore);
        expect(settingsBBefore).toEqual({
          name: 'Barbearia B',
          address: null,
          timezone: 'America/Sao_Paulo',
          openingHours: ALL_CLOSED,
        });
      });

      it('CA-03.1: a barber gets 403 and nothing changes', async () => {
        const barberToken = await createBarber(
          app,
          emailSender,
          appWebUrl,
          ownerToken,
          'joao@exemplo.com',
        );

        const response = await putSettings(barberToken, SETTINGS);

        expect(response.status).toBe(403);
        expect(response.body).toEqual(FORBIDDEN);
        expect(await currentSettings()).toEqual({
          name: 'Barbearia do Zé',
          address: null,
          timezone: 'America/Sao_Paulo',
          openingHours: ALL_CLOSED,
        });
      });

      it('CA-03.1: a PUT without a session gets 401', async () => {
        const response = await putSettings(undefined, SETTINGS);

        expect(response.status).toBe(401);
        expect(response.body).toEqual(UNAUTHORIZED);
      });
    });
  });
});

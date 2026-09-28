import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ListBookableServicesUseCase } from '../src/usecases/list-bookable-services/list-bookable-services.use-case';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { createBarber, signupOwner } from './support/account-flows';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const FORBIDDEN = { message: 'Acesso negado.' };
const UNAUTHORIZED = { message: 'Sessão inválida ou expirada.' };

const HAIRCUT = { name: 'Corte', priceCents: 4500, durationMinutes: 30 };

interface ServiceBody {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  suggestedAddOnIds: string[];
}

describe('/settings/services (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;
  let ownerToken: string;

  function authorized(
    call: request.Test,
    token: string | undefined,
  ): request.Test {
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function listServices(token: string | undefined) {
    return authorized(
      request(app.getHttpServer()).get('/settings/services'),
      token,
    );
  }

  function postService(token: string | undefined, body: unknown) {
    return authorized(
      request(app.getHttpServer()).post('/settings/services'),
      token,
    ).send(body as object);
  }

  function putService(
    token: string | undefined,
    serviceId: string,
    body: unknown,
  ) {
    return authorized(
      request(app.getHttpServer()).put(`/settings/services/${serviceId}`),
      token,
    ).send(body as object);
  }

  function changeStatus(
    token: string | undefined,
    serviceId: string,
    action: 'activate' | 'deactivate',
  ) {
    return authorized(
      request(app.getHttpServer()).post(
        `/settings/services/${serviceId}/${action}`,
      ),
      token,
    );
  }

  async function bookableNames(): Promise<string[]> {
    const [row] = await dataSource.query<{ id: string }[]>(
      "SELECT id FROM barbershops WHERE name = 'Barbearia do Zé'",
    );
    const services = await app
      .get(ListBookableServicesUseCase)
      .execute({ barbershopId: row.id });
    return services.map((service) => service.name);
  }

  async function currentServices(
    token: string = ownerToken,
  ): Promise<ServiceBody[]> {
    const response = await listServices(token).expect(200);
    return (response.body as { services: ServiceBody[] }).services;
  }

  async function created(
    body: Record<string, unknown>,
    token: string = ownerToken,
  ): Promise<ServiceBody> {
    const response = await postService(token, body).expect(201);
    return response.body as ServiceBody;
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

  describe('POST and GET', () => {
    it('CA-04.1: POST "Corte" R$ 45,00 30 min answers 201 with the active service and GET lists it', async () => {
      const response = await postService(ownerToken, HAIRCUT);

      expect(response.status).toBe(201);
      const body = response.body as ServiceBody;
      expect(body).toEqual({
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        ) as unknown,
        name: 'Corte',
        priceCents: 4500,
        durationMinutes: 30,
        active: true,
        suggestedAddOnIds: [],
      });
      expect(await currentServices()).toEqual([body]);
    });

    it('CA-04.1: GET answers an empty list when the barbershop has no services', async () => {
      const response = await listServices(ownerToken);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ services: [] });
    });

    it('CA-04.1: GET orders by case-insensitive name', async () => {
      await created({ ...HAIRCUT, name: 'Sobrancelha' });
      await created({ ...HAIRCUT, name: 'barba' });
      await created({ ...HAIRCUT, name: 'Corte' });

      expect((await currentServices()).map((service) => service.name)).toEqual([
        'barba',
        'Corte',
        'Sobrancelha',
      ]);
    });

    it('CA-04.1: trims the name, accepts price 0 and durations 5 and 480, and ignores active and barbershopId in the body', async () => {
      const free = await created({
        name: '  Avaliação  ',
        priceCents: 0,
        durationMinutes: 5,
        active: false,
      });
      const long = await created({
        name: 'Dia do noivo',
        priceCents: 1_000_000,
        durationMinutes: 480,
      });

      expect(free).toMatchObject({
        name: 'Avaliação',
        priceCents: 0,
        durationMinutes: 5,
        active: true,
      });
      expect(long).toMatchObject({
        priceCents: 1_000_000,
        durationMinutes: 480,
      });
    });

    it('CA-04.1: POST "corte" when "Corte" exists answers 409 and GET shows no new service', async () => {
      const existing = await created(HAIRCUT);

      const response = await postService(ownerToken, {
        ...HAIRCUT,
        name: 'corte',
        priceCents: 9000,
      });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        message: 'Já existe um serviço com esse nome.',
      });
      expect(await currentServices()).toEqual([existing]);
    });
  });

  describe('CA-04.2: suggested add-ons', () => {
    it('creates "Corte" with "Barba" as add-on, answers 201 with the relation and GET returns it', async () => {
      const beard = await created({ ...HAIRCUT, name: 'Barba' });

      const response = await postService(ownerToken, {
        ...HAIRCUT,
        suggestedAddOnIds: [beard.id],
      });

      expect(response.status).toBe(201);
      const haircut = response.body as ServiceBody;
      expect(haircut.suggestedAddOnIds).toEqual([beard.id]);
      const listed = await currentServices();
      expect(listed.find((service) => service.id === haircut.id)).toEqual(
        haircut,
      );
    });

    it('rejects an unknown add-on with 400 and saves nothing', async () => {
      const response = await postService(ownerToken, {
        ...HAIRCUT,
        suggestedAddOnIds: [randomUUID()],
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Serviço adicional não encontrado.',
      });
      expect(await currentServices()).toEqual([]);
    });

    it('rejects an add-on of another barbershop with 400 and saves nothing', async () => {
      const { accessToken: tokenB } = await signupOwner(
        app,
        'dono@barbearia-b.com',
        'Barbearia B',
      );
      const foreign = await created({ ...HAIRCUT, name: 'Barba' }, tokenB);

      const response = await postService(ownerToken, {
        ...HAIRCUT,
        suggestedAddOnIds: [foreign.id],
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Serviço adicional não encontrado.',
      });
      expect(await currentServices()).toEqual([]);
    });

    it('rejects an inactive add-on with 400 and saves nothing', async () => {
      const brows = await created({ ...HAIRCUT, name: 'Sobrancelha' });
      await dataSource.query(
        'UPDATE services SET active = false WHERE id = $1',
        [brows.id],
      );
      const before = await currentServices();

      const response = await postService(ownerToken, {
        ...HAIRCUT,
        suggestedAddOnIds: [brows.id],
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Os serviços adicionais devem estar ativos.',
      });
      expect(await currentServices()).toEqual(before);
    });

    it('rejects more than 5 add-ons or a repeated one with 400 on the suggestedAddOnIds field', async () => {
      const beard = await created({ ...HAIRCUT, name: 'Barba' });
      const before = await currentServices();
      const sixIds = Array.from({ length: 6 }, () => randomUUID());

      const tooMany = await postService(ownerToken, {
        ...HAIRCUT,
        suggestedAddOnIds: sixIds,
      });
      const repeated = await postService(ownerToken, {
        ...HAIRCUT,
        suggestedAddOnIds: [beard.id, beard.id],
      });

      const expected = {
        message: 'Dados inválidos.',
        errors: [
          {
            field: 'suggestedAddOnIds',
            message: 'Escolha até 5 serviços adicionais, sem repetir.',
          },
        ],
      };
      expect(tooMany.status).toBe(400);
      expect(tooMany.body).toEqual(expected);
      expect(repeated.status).toBe(400);
      expect(repeated.body).toEqual(expected);
      expect(await currentServices()).toEqual(before);
    });
  });

  describe('CA-04.4: invalid price and duration', () => {
    it('rejects priceCents -1 with 400 on the priceCents field and saves nothing', async () => {
      const response = await postService(ownerToken, {
        ...HAIRCUT,
        priceCents: -1,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [
          {
            field: 'priceCents',
            message: 'Informe o preço em centavos, de 0 a 1000000.',
          },
        ],
      });
      expect(await currentServices()).toEqual([]);
    });

    it('rejects durationMinutes 0 with 400 on the durationMinutes field and saves nothing', async () => {
      const response = await postService(ownerToken, {
        ...HAIRCUT,
        durationMinutes: 0,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [
          {
            field: 'durationMinutes',
            message:
              'Informe a duração em minutos, de 5 a 480, em múltiplos de 5.',
          },
        ],
      });
      expect(await currentServices()).toEqual([]);
    });

    it('rejects a non-integer price, a duration off the 5-minute step and a 1-character name, each on its field', async () => {
      const response = await postService(ownerToken, {
        name: 'C',
        priceCents: 45.5,
        durationMinutes: 7,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [
          {
            field: 'name',
            message: 'Informe o nome do serviço, com 2 a 60 caracteres.',
          },
          {
            field: 'priceCents',
            message: 'Informe o preço em centavos, de 0 a 1000000.',
          },
          {
            field: 'durationMinutes',
            message:
              'Informe a duração em minutos, de 5 a 480, em múltiplos de 5.',
          },
        ],
      });
      expect(await currentServices()).toEqual([]);
    });
  });

  describe('PUT', () => {
    it('CA-04.1: replaces name, price, duration and add-ons, keeps active, answers 200 and GET confirms', async () => {
      const beard = await created({ ...HAIRCUT, name: 'Barba' });
      const haircut = await created(HAIRCUT);

      const response = await putService(ownerToken, haircut.id, {
        name: 'Corte Degradê',
        priceCents: 5000,
        durationMinutes: 45,
        suggestedAddOnIds: [beard.id],
      });

      const expected = {
        id: haircut.id,
        name: 'Corte Degradê',
        priceCents: 5000,
        durationMinutes: 45,
        active: true,
        suggestedAddOnIds: [beard.id],
      };
      expect(response.status).toBe(200);
      expect(response.body).toEqual(expected);
      expect(await currentServices()).toEqual([beard, expected]);
    });

    it('CA-04.1: an inactive service stays inactive after a PUT', async () => {
      const brows = await created({ ...HAIRCUT, name: 'Sobrancelha' });
      await dataSource.query(
        'UPDATE services SET active = false WHERE id = $1',
        [brows.id],
      );

      const response = await putService(ownerToken, brows.id, {
        ...HAIRCUT,
        name: 'Sobrancelha',
        priceCents: 2500,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ active: false, priceCents: 2500 });
    });

    it('CA-04.1: sending the same PUT twice answers 200 both times and ends in the same state', async () => {
      const haircut = await created(HAIRCUT);
      const body = { ...HAIRCUT, name: 'Corte Degradê', priceCents: 5000 };

      const first = await putService(ownerToken, haircut.id, body);
      const second = await putService(ownerToken, haircut.id, body);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(await currentServices()).toEqual([first.body]);
    });

    it('CA-04.2: another add-on list, including an empty one, replaces the previous list', async () => {
      const beard = await created({ ...HAIRCUT, name: 'Barba' });
      const brows = await created({ ...HAIRCUT, name: 'Sobrancelha' });
      const haircut = await created({
        ...HAIRCUT,
        suggestedAddOnIds: [beard.id],
      });

      const replaced = await putService(ownerToken, haircut.id, {
        ...HAIRCUT,
        suggestedAddOnIds: [brows.id],
      });
      expect(replaced.status).toBe(200);
      expect((replaced.body as ServiceBody).suggestedAddOnIds).toEqual([
        brows.id,
      ]);

      const emptied = await putService(ownerToken, haircut.id, {
        ...HAIRCUT,
        suggestedAddOnIds: [],
      });
      expect(emptied.status).toBe(200);
      const listed = await currentServices();
      expect(
        listed.find((service) => service.id === haircut.id)?.suggestedAddOnIds,
      ).toEqual([]);
    });

    it('CA-04.1: keeping its own name with another case answers 200', async () => {
      const haircut = await created(HAIRCUT);

      const response = await putService(ownerToken, haircut.id, {
        ...HAIRCUT,
        name: 'CORTE',
      });

      expect(response.status).toBe(200);
      expect((response.body as ServiceBody).name).toBe('CORTE');
    });

    it('CA-04.1: the name of another service answers 409 and nothing changes', async () => {
      await created(HAIRCUT);
      const beard = await created({ ...HAIRCUT, name: 'Barba' });
      const before = await currentServices();

      const response = await putService(ownerToken, beard.id, {
        ...HAIRCUT,
        name: 'corte',
      });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        message: 'Já existe um serviço com esse nome.',
      });
      expect(await currentServices()).toEqual(before);
    });

    it('CA-04.2: its own id in the add-on list answers 400 and nothing changes', async () => {
      const beard = await created({ ...HAIRCUT, name: 'Barba' });
      const haircut = await created(HAIRCUT);
      const before = await currentServices();

      const response = await putService(ownerToken, haircut.id, {
        ...HAIRCUT,
        name: 'Corte Novo',
        suggestedAddOnIds: [beard.id, haircut.id],
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Um serviço não pode ser adicional de si mesmo.',
      });
      expect(await currentServices()).toEqual(before);
    });

    it('CA-04.3: an unknown serviceId answers 404 and nothing changes', async () => {
      const haircut = await created(HAIRCUT);

      const response = await putService(ownerToken, randomUUID(), {
        ...HAIRCUT,
        name: 'Corte Novo',
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Serviço não encontrado.' });
      expect(await currentServices()).toEqual([haircut]);
    });

    it('RN-26: a PUT from A on a service of B answers 404 and B stays the same', async () => {
      const { accessToken: tokenB } = await signupOwner(
        app,
        'dono@barbearia-b.com',
        'Barbearia B',
      );
      const foreign = await created(HAIRCUT, tokenB);

      const response = await putService(ownerToken, foreign.id, {
        ...HAIRCUT,
        name: 'Tomado',
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Serviço não encontrado.' });
      expect(await currentServices(tokenB)).toEqual([foreign]);
    });

    it('a malformed serviceId answers 400 on the serviceId field', async () => {
      const response = await putService(ownerToken, 'corte', HAIRCUT);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Dados inválidos.',
        errors: [
          { field: 'serviceId', message: 'Informe um id de serviço válido.' },
        ],
      });
    });

    it('a barber gets 403 on PUT and nothing changes', async () => {
      const haircut = await created(HAIRCUT);
      const barberToken = await createBarber(
        app,
        emailSender,
        appWebUrl,
        ownerToken,
        'joao@exemplo.com',
      );

      const response = await putService(barberToken, haircut.id, {
        ...HAIRCUT,
        priceCents: 1,
      });

      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN);
      expect(await currentServices()).toEqual([haircut]);
    });
  });

  describe('CA-04.3: deactivate and activate', () => {
    it('deactivate answers 200 with active: false, GET keeps listing it with the same data and it leaves the bookable services', async () => {
      const beard = await created({ ...HAIRCUT, name: 'Barba' });
      const brows = await created({
        ...HAIRCUT,
        name: 'Sobrancelha',
        suggestedAddOnIds: [beard.id],
      });
      const haircut = await created({
        ...HAIRCUT,
        suggestedAddOnIds: [brows.id],
      });
      expect(await bookableNames()).toEqual(['Barba', 'Corte', 'Sobrancelha']);

      const response = await changeStatus(ownerToken, brows.id, 'deactivate');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ...brows, active: false });
      expect(await currentServices()).toEqual([
        beard,
        haircut,
        { ...brows, active: false },
      ]);
      expect(await bookableNames()).toEqual(['Barba', 'Corte']);
    });

    it('activate answers 200 with active: true and the service is bookable again', async () => {
      const brows = await created({ ...HAIRCUT, name: 'Sobrancelha' });
      await changeStatus(ownerToken, brows.id, 'deactivate').expect(200);

      const response = await changeStatus(ownerToken, brows.id, 'activate');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(brows);
      expect(await currentServices()).toEqual([brows]);
      expect(await bookableNames()).toEqual(['Sobrancelha']);
    });

    it.each(['deactivate', 'activate'] as const)(
      'repeating %s answers 200 with the service unchanged',
      async (action) => {
        const brows = await created({ ...HAIRCUT, name: 'Sobrancelha' });
        await changeStatus(ownerToken, brows.id, action).expect(200);

        const response = await changeStatus(ownerToken, brows.id, action);

        const expected = { ...brows, active: action === 'activate' };
        expect(response.status).toBe(200);
        expect(response.body).toEqual(expected);
        expect(await currentServices()).toEqual([expected]);
      },
    );

    it.each(['deactivate', 'activate'] as const)(
      '%s of an unknown serviceId answers 404 and nothing changes',
      async (action) => {
        const haircut = await created(HAIRCUT);

        const response = await changeStatus(ownerToken, randomUUID(), action);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ message: 'Serviço não encontrado.' });
        expect(await currentServices()).toEqual([haircut]);
      },
    );

    it('RN-26: deactivating a service of B from A answers 404 and B stays active', async () => {
      const { accessToken: tokenB } = await signupOwner(
        app,
        'dono@barbearia-b.com',
        'Barbearia B',
      );
      const foreign = await created(HAIRCUT, tokenB);

      const response = await changeStatus(ownerToken, foreign.id, 'deactivate');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Serviço não encontrado.' });
      expect(await currentServices(tokenB)).toEqual([foreign]);
    });

    it('a barber gets 403 on deactivate and activate and nothing changes', async () => {
      const haircut = await created(HAIRCUT);
      const barberToken = await createBarber(
        app,
        emailSender,
        appWebUrl,
        ownerToken,
        'joao@exemplo.com',
      );

      const deactivate = await changeStatus(
        barberToken,
        haircut.id,
        'deactivate',
      );
      const activate = await changeStatus(barberToken, haircut.id, 'activate');

      expect(deactivate.status).toBe(403);
      expect(deactivate.body).toEqual(FORBIDDEN);
      expect(activate.status).toBe(403);
      expect(activate.body).toEqual(FORBIDDEN);
      expect(await currentServices()).toEqual([haircut]);
    });

    it('a request without a session gets 401 on deactivate and activate', async () => {
      const haircut = await created(HAIRCUT);

      const deactivate = await changeStatus(
        undefined,
        haircut.id,
        'deactivate',
      );
      const activate = await changeStatus(undefined, haircut.id, 'activate');

      expect(deactivate.status).toBe(401);
      expect(deactivate.body).toEqual(UNAUTHORIZED);
      expect(activate.status).toBe(401);
      expect(activate.body).toEqual(UNAUTHORIZED);
      expect(await currentServices()).toEqual([haircut]);
    });
  });

  describe('permissions and tenant', () => {
    it('RN-26: GET of A does not list services of B, and a POST from A carrying the id of B in body, query and header creates only in A', async () => {
      const { accessToken: tokenB } = await signupOwner(
        app,
        'dono@barbearia-b.com',
        'Barbearia B',
      );
      const foreign = await created({ ...HAIRCUT, name: 'Alisamento' }, tokenB);
      const [rowB] = await dataSource.query<{ id: string }[]>(
        "SELECT id FROM barbershops WHERE name = 'Barbearia B'",
      );

      const response = await request(app.getHttpServer())
        .post(`/settings/services?barbershopId=${rowB.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-barbershop-id', rowB.id)
        .send({ ...HAIRCUT, barbershopId: rowB.id });

      expect(response.status).toBe(201);
      expect(await currentServices()).toEqual([response.body]);
      expect(await currentServices(tokenB)).toEqual([foreign]);
    });

    it('a barber gets 403 on GET and POST and nothing is created', async () => {
      const barberToken = await createBarber(
        app,
        emailSender,
        appWebUrl,
        ownerToken,
        'joao@exemplo.com',
      );

      const list = await listServices(barberToken);
      const create = await postService(barberToken, HAIRCUT);

      expect(list.status).toBe(403);
      expect(list.body).toEqual(FORBIDDEN);
      expect(create.status).toBe(403);
      expect(create.body).toEqual(FORBIDDEN);
      expect(await currentServices()).toEqual([]);
    });

    it('a request without a session gets 401 on GET and POST', async () => {
      const list = await listServices(undefined);
      const create = await postService(undefined, HAIRCUT);

      expect(list.status).toBe(401);
      expect(list.body).toEqual(UNAUTHORIZED);
      expect(create.status).toBe(401);
      expect(create.body).toEqual(UNAUTHORIZED);
      expect(await currentServices()).toEqual([]);
    });
  });
});

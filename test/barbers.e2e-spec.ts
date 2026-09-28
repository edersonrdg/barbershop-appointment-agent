import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { FindBarberByUserUseCase } from '../src/usecases/find-barber-by-user/find-barber-by-user.use-case';
import { ListSchedulableBarbersUseCase } from '../src/usecases/list-schedulable-barbers/list-schedulable-barbers.use-case';
import { FakeEmailSender } from '../src/usecases/testing/fake-email-sender';
import { createBarber, signupOwner } from './support/account-flows';
import { createAccountTestApp } from './support/create-account-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const FORBIDDEN = { message: 'Acesso negado.' };
const UNAUTHORIZED = { message: 'Sessão inválida ou expirada.' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Day = {
  startsAt: string;
  endsAt: string;
  break: { startsAt: string; endsAt: string } | null;
} | null;
type Week = Record<
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday',
  Day
>;

const OFF_WEEK: Week = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

function day(
  startsAt: string,
  endsAt: string,
  workBreak: [string, string] | null = null,
): Day {
  return {
    startsAt,
    endsAt,
    break: workBreak ? { startsAt: workBreak[0], endsAt: workBreak[1] } : null,
  };
}

// Segunda a sexta 09:00-18:00 com intervalo 12:00-13:00: dentro do horário.
const WEEKDAYS_JOURNEY: Week = {
  ...OFF_WEEK,
  monday: day('09:00', '18:00', ['12:00', '13:00']),
  tuesday: day('09:00', '18:00', ['12:00', '13:00']),
  wednesday: day('09:00', '18:00', ['12:00', '13:00']),
  thursday: day('09:00', '18:00', ['12:00', '13:00']),
  friday: day('09:00', '18:00', ['12:00', '13:00']),
};

// Segunda a sábado 09:00-19:00 com intervalo 12:00-13:00; domingo fechado.
const OPENING_HOURS = {
  monday: {
    opensAt: '09:00',
    closesAt: '19:00',
    break: { startsAt: '12:00', endsAt: '13:00' },
  },
  tuesday: {
    opensAt: '09:00',
    closesAt: '19:00',
    break: { startsAt: '12:00', endsAt: '13:00' },
  },
  wednesday: {
    opensAt: '09:00',
    closesAt: '19:00',
    break: { startsAt: '12:00', endsAt: '13:00' },
  },
  thursday: {
    opensAt: '09:00',
    closesAt: '19:00',
    break: { startsAt: '12:00', endsAt: '13:00' },
  },
  friday: {
    opensAt: '09:00',
    closesAt: '19:00',
    break: { startsAt: '12:00', endsAt: '13:00' },
  },
  saturday: {
    opensAt: '09:00',
    closesAt: '19:00',
    break: { startsAt: '12:00', endsAt: '13:00' },
  },
  sunday: null,
};

interface BarberBody {
  id: string;
  name: string;
  active: boolean;
  userId: string | null;
  serviceIds: string[];
  workingHours: Week;
}

interface SavedBarberBody extends BarberBody {
  warnings: { weekday: string; message: string }[];
}

function withoutWarnings(saved: SavedBarberBody): BarberBody {
  const barber: Partial<SavedBarberBody> = { ...saved };
  delete barber.warnings;
  return barber as BarberBody;
}

describe('/settings/barbers (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let emailSender: FakeEmailSender;
  let appWebUrl: string;
  let ownerToken: string;
  let haircutId: string;
  let beardId: string;

  function authorized(
    call: request.Test,
    token: string | undefined,
  ): request.Test {
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function listBarbers(token: string | undefined) {
    return authorized(
      request(app.getHttpServer()).get('/settings/barbers'),
      token,
    );
  }

  function postBarber(token: string | undefined, body: unknown) {
    return authorized(
      request(app.getHttpServer()).post('/settings/barbers'),
      token,
    ).send(body as object);
  }

  async function createService(
    name: string,
    token: string = ownerToken,
  ): Promise<string> {
    const response = await authorized(
      request(app.getHttpServer()).post('/settings/services'),
      token,
    )
      .send({ name, priceCents: 4500, durationMinutes: 30 })
      .expect(201);
    return (response.body as { id: string }).id;
  }

  async function deactivateService(serviceId: string): Promise<void> {
    await authorized(
      request(app.getHttpServer()).post(
        `/settings/services/${serviceId}/deactivate`,
      ),
      ownerToken,
    ).expect(200);
  }

  async function saveOpeningHours(token: string = ownerToken): Promise<void> {
    await authorized(
      request(app.getHttpServer()).put('/settings/barbershop'),
      token,
    )
      .send({
        name: 'Barbearia do Zé',
        address: 'Rua das Flores, 123',
        timezone: 'America/Sao_Paulo',
        openingHours: OPENING_HOURS,
      })
      .expect(200);
  }

  async function userIdByEmail(
    email: string,
    token: string = ownerToken,
  ): Promise<string> {
    const response = await authorized(
      request(app.getHttpServer()).get('/users'),
      token,
    ).expect(200);
    const users = (response.body as { users: { id: string; email: string }[] })
      .users;
    const found = users.find((user) => user.email === email);
    if (!found) throw new Error(`user ${email} not found`);
    return found.id;
  }

  async function barbershopIdOf(name: string): Promise<string> {
    const [row] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM barbershops WHERE name = $1',
      [name],
    );
    return row.id;
  }

  async function currentBarbers(
    token: string = ownerToken,
  ): Promise<BarberBody[]> {
    const response = await listBarbers(token).expect(200);
    return (response.body as { barbers: BarberBody[] }).barbers;
  }

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'João',
      serviceIds: [haircutId],
      workingHours: WEEKDAYS_JOURNEY,
      ...overrides,
    };
  }

  async function created(
    overrides: Record<string, unknown> = {},
    token: string = ownerToken,
  ): Promise<SavedBarberBody> {
    const response = await postBarber(token, validBody(overrides)).expect(201);
    return response.body as SavedBarberBody;
  }

  async function secondBarbershop(): Promise<{
    token: string;
    serviceId: string;
  }> {
    const { accessToken } = await signupOwner(
      app,
      'dono@outra.com',
      'Barbearia B',
    );
    const serviceId = await createService('Corte', accessToken);
    return { token: accessToken, serviceId };
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
    await saveOpeningHours();
    haircutId = await createService('Corte');
    beardId = await createService('Barba');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST and GET', () => {
    it('CA-05.1: POST "João" with a service and a Monday-to-Friday journey answers 201 with the active barber and GET lists it', async () => {
      const response = await postBarber(
        ownerToken,
        validBody({ serviceIds: [beardId, haircutId] }),
      );

      expect(response.status).toBe(201);
      const body = response.body as SavedBarberBody;
      expect(body).toEqual({
        id: expect.stringMatching(UUID) as unknown,
        name: 'João',
        active: true,
        userId: null,
        serviceIds: [beardId, haircutId],
        workingHours: WEEKDAYS_JOURNEY,
        warnings: [],
      });
      expect(await currentBarbers()).toEqual([withoutWarnings(body)]);
    });

    it('CA-05.1: the created barber is available to the schedule', async () => {
      const barber = await created();

      const schedulable = await app
        .get(ListSchedulableBarbersUseCase)
        .execute({ barbershopId: await barbershopIdOf('Barbearia do Zé') });

      expect(
        schedulable.map((found) => ({
          id: found.id,
          serviceIds: [...found.serviceIds],
          mondayStartsAt: found.workingHours
            .forDay('monday')
            ?.startsAt.toString(),
        })),
      ).toEqual([
        { id: barber.id, serviceIds: [haircutId], mondayStartsAt: '09:00' },
      ]);
    });

    it('CA-05.1: GET answers an empty list when the barbershop has no barbers', async () => {
      const response = await listBarbers(ownerToken);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ barbers: [] });
    });

    it('CA-05.1: GET orders by case-insensitive name', async () => {
      await created({ name: 'Pedro' });
      await created({ name: 'ana' });
      await created({ name: 'João' });

      expect((await currentBarbers()).map((barber) => barber.name)).toEqual([
        'ana',
        'João',
        'Pedro',
      ]);
    });

    it('CA-05.1: trims the name, accepts every day off and ignores active and barbershopId in the body', async () => {
      const barber = await created({
        name: '  Carlos  ',
        workingHours: OFF_WEEK,
        active: false,
        barbershopId: randomUUID(),
      });

      expect(barber).toMatchObject({
        name: 'Carlos',
        active: true,
        workingHours: OFF_WEEK,
        warnings: [],
      });
    });

    it('CA-05.1: an omitted break comes back as null', async () => {
      const barber = await created({
        workingHours: {
          ...OFF_WEEK,
          monday: { startsAt: '09:00', endsAt: '12:00' },
        },
      });

      expect(barber.workingHours.monday).toEqual(day('09:00', '12:00'));
    });

    it('CA-05.1: POST "joão" when "João" exists answers 409 and GET shows no new barber', async () => {
      const existing = await created();

      const response = await postBarber(
        ownerToken,
        validBody({ name: 'joão' }),
      );

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        message: 'Já existe um barbeiro com esse nome.',
      });
      expect((await currentBarbers()).map((barber) => barber.id)).toEqual([
        existing.id,
      ]);
    });
  });

  describe('services performed', () => {
    it('CA-05.1: rejects an inactive service with 400 and saves nothing', async () => {
      await deactivateService(beardId);

      const response = await postBarber(
        ownerToken,
        validBody({ serviceIds: [haircutId, beardId] }),
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Os serviços realizados devem estar ativos.',
      });
      expect(await currentBarbers()).toEqual([]);
    });

    it('CA-05.1: rejects an unknown service with 400 and saves nothing', async () => {
      const response = await postBarber(
        ownerToken,
        validBody({ serviceIds: [randomUUID()] }),
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Serviço não encontrado.' });
      expect(await currentBarbers()).toEqual([]);
    });

    it('RN-26: rejects a service of another barbershop with 400 and saves nothing', async () => {
      const other = await secondBarbershop();

      const response = await postBarber(
        ownerToken,
        validBody({ serviceIds: [other.serviceId] }),
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Serviço não encontrado.' });
      expect(await currentBarbers()).toEqual([]);
    });

    it.each([
      ['an empty list', () => []],
      ['a repeated service', (id: string) => [id, id]],
      ['51 services', () => Array.from({ length: 51 }, () => randomUUID())],
    ])(
      'CA-05.1: rejects %s with 400 on the serviceIds field and saves nothing',
      async (_case, serviceIds) => {
        const response = await postBarber(
          ownerToken,
          validBody({ serviceIds: serviceIds(haircutId) }),
        );

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          message: 'Dados inválidos.',
          errors: [
            {
              field: 'serviceIds',
              message: 'Escolha de 1 a 50 serviços realizados, sem repetir.',
            },
          ],
        });
        expect(await currentBarbers()).toEqual([]);
      },
    );
  });

  describe('working hours', () => {
    it('CA-05.3: saves a journey starting before opening and working on Sunday, answering 201 with two warnings', async () => {
      const response = await postBarber(
        ownerToken,
        validBody({
          workingHours: {
            ...OFF_WEEK,
            monday: day('08:00', '18:00', ['12:00', '13:00']),
            sunday: day('09:00', '13:00'),
          },
        }),
      );

      expect(response.status).toBe(201);
      expect((response.body as SavedBarberBody).warnings).toEqual([
        {
          weekday: 'monday',
          message:
            'Segunda-feira: só o trecho da jornada dentro do horário de funcionamento estará disponível.',
        },
        {
          weekday: 'sunday',
          message:
            'Domingo: a barbearia não abre neste dia, então a jornada não estará disponível.',
        },
      ]);
      const [barber] = await currentBarbers();
      expect(barber.workingHours.sunday).toEqual(day('09:00', '13:00'));
      expect(barber).not.toHaveProperty('warnings');
    });

    it('CA-05.3: warns when the journey works through the barbershop break', async () => {
      const barber = await created({
        workingHours: { ...OFF_WEEK, tuesday: day('09:00', '19:00') },
      });

      expect(barber.warnings).toEqual([
        {
          weekday: 'tuesday',
          message:
            'Terça-feira: só o trecho da jornada dentro do horário de funcionamento estará disponível.',
        },
      ]);
    });

    it('CA-05.3: a journey equal to the opening hours answers warnings []', async () => {
      const barber = await created({
        workingHours: {
          ...OFF_WEEK,
          saturday: day('09:00', '19:00', ['12:00', '13:00']),
        },
      });

      expect(barber.warnings).toEqual([]);
    });

    it('CA-05.1: rejects an end before the start with 400 naming the day and saves nothing', async () => {
      const response = await postBarber(
        ownerToken,
        validBody({
          workingHours: { ...OFF_WEEK, monday: day('18:00', '09:00') },
        }),
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Segunda-feira: o fim da jornada deve ser depois do início.',
      });
      expect(await currentBarbers()).toEqual([]);
    });

    it('CA-05.1: rejects a break outside the journey with 400 and saves nothing', async () => {
      const response = await postBarber(
        ownerToken,
        validBody({
          workingHours: {
            ...OFF_WEEK,
            friday: day('09:00', '18:00', ['17:00', '18:30']),
          },
        }),
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message:
          'Sexta-feira: o intervalo deve começar e terminar dentro da jornada, com o fim depois do início.',
      });
      expect(await currentBarbers()).toEqual([]);
    });

    it('CA-05.1: rejects working hours without Sunday or with a 24:00 time on the field', async () => {
      const sixDays: Partial<Week> = { ...OFF_WEEK };
      delete sixDays.sunday;

      const missingDay = await postBarber(
        ownerToken,
        validBody({ workingHours: sixDays }),
      );
      const badTime = await postBarber(
        ownerToken,
        validBody({
          workingHours: { ...OFF_WEEK, monday: day('09:00', '24:00') },
        }),
      );

      expect(missingDay.status).toBe(400);
      expect(missingDay.body).toEqual({
        message: 'Dados inválidos.',
        errors: [
          {
            field: 'workingHours.sunday',
            message: 'Informe a jornada do dia, ou null se for folga.',
          },
        ],
      });
      expect(badTime.status).toBe(400);
      expect(badTime.body).toEqual({
        message: 'Dados inválidos.',
        errors: [
          {
            field: 'workingHours.monday.endsAt',
            message: 'Informe o horário no formato HH:mm, entre 00:00 e 23:59.',
          },
        ],
      });
      expect(await currentBarbers()).toEqual([]);
    });
  });

  describe('link with a panel user', () => {
    it('CA-05.2: links an invited barber and the schedule finds the barber by the user', async () => {
      await createBarber(
        app,
        emailSender,
        appWebUrl,
        ownerToken,
        'joao@barbearia.com',
      );
      const userId = await userIdByEmail('joao@barbearia.com');

      const barber = await created({ userId });

      expect(barber.userId).toBe(userId);
      expect((await currentBarbers())[0].userId).toBe(userId);
      const found = await app.get(FindBarberByUserUseCase).execute({
        barbershopId: await barbershopIdOf('Barbearia do Zé'),
        userId,
      });
      expect(found?.id).toBe(barber.id);
    });

    it('CA-05.2: links the owner', async () => {
      const ownerId = await userIdByEmail('dono@barbearia.com');

      const barber = await created({ userId: ownerId });

      expect(barber.userId).toBe(ownerId);
    });

    it('CA-05.2: userId null or omitted creates without link', async () => {
      const explicit = await created({ name: 'Ana', userId: null });
      const omitted = await created({ name: 'Bia' });

      expect(explicit.userId).toBeNull();
      expect(omitted.userId).toBeNull();
    });

    it('CA-05.2: an unknown user answers 400 and saves nothing', async () => {
      const response = await postBarber(
        ownerToken,
        validBody({ userId: randomUUID() }),
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Usuário não encontrado.' });
      expect(await currentBarbers()).toEqual([]);
    });

    it('RN-26: a user of another barbershop answers 400 and saves nothing', async () => {
      const other = await secondBarbershop();
      const foreignUser = await userIdByEmail('dono@outra.com', other.token);

      const response = await postBarber(
        ownerToken,
        validBody({ userId: foreignUser }),
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Usuário não encontrado.' });
      expect(await currentBarbers()).toEqual([]);
    });

    it('CA-05.2: a user already linked answers 409 and saves nothing', async () => {
      const ownerId = await userIdByEmail('dono@barbearia.com');
      const existing = await created({ userId: ownerId });

      const response = await postBarber(
        ownerToken,
        validBody({ name: 'Pedro', userId: ownerId }),
      );

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        message: 'Esse usuário já está vinculado a outro barbeiro.',
      });
      expect((await currentBarbers()).map((barber) => barber.id)).toEqual([
        existing.id,
      ]);
    });

    it('CA-05.2: removing the linked user keeps the barber with userId null', async () => {
      await createBarber(
        app,
        emailSender,
        appWebUrl,
        ownerToken,
        'joao@barbearia.com',
      );
      const userId = await userIdByEmail('joao@barbearia.com');
      const barber = await created({ userId });

      await authorized(
        request(app.getHttpServer()).delete(`/users/${userId}`),
        ownerToken,
      ).expect(204);

      expect(await currentBarbers()).toEqual([
        { ...withoutWarnings(barber), userId: null },
      ]);
    });
  });

  describe('permissions and tenant', () => {
    it('RN-26: GET of A does not list barbers of B, and a POST from A carrying the id of B in body, query and header creates only in A', async () => {
      const other = await secondBarbershop();
      await created(
        { name: 'Bruno', serviceIds: [other.serviceId] },
        other.token,
      );
      const barbershopB = await barbershopIdOf('Barbearia B');

      await authorized(
        request(app.getHttpServer())
          .post(`/settings/barbers?barbershopId=${barbershopB}`)
          .set('x-barbershop-id', barbershopB),
        ownerToken,
      )
        .send(validBody({ barbershopId: barbershopB }))
        .expect(201);

      expect((await currentBarbers()).map((barber) => barber.name)).toEqual([
        'João',
      ]);
      expect(
        (await currentBarbers(other.token)).map((barber) => barber.name),
      ).toEqual(['Bruno']);
    });

    it('a barber gets 403 on GET and POST and nothing is created', async () => {
      const barberToken = await createBarber(
        app,
        emailSender,
        appWebUrl,
        ownerToken,
        'joao@barbearia.com',
      );

      const list = await listBarbers(barberToken);
      const post = await postBarber(barberToken, validBody());

      expect(list.status).toBe(403);
      expect(list.body).toEqual(FORBIDDEN);
      expect(post.status).toBe(403);
      expect(post.body).toEqual(FORBIDDEN);
      expect(await currentBarbers()).toEqual([]);
    });

    it('a request without a session gets 401 on GET and POST', async () => {
      const list = await listBarbers(undefined);
      const post = await postBarber(undefined, validBody());

      expect(list.status).toBe(401);
      expect(list.body).toEqual(UNAUTHORIZED);
      expect(post.status).toBe(401);
      expect(post.body).toEqual(UNAUTHORIZED);
      expect(await currentBarbers()).toEqual([]);
    });
  });
});

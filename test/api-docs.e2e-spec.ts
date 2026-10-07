import { INestApplication } from '@nestjs/common';
import type {
  OpenAPIObject,
  OperationObject,
  ResponseObject,
} from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  buildApiDocument,
  setupApiDocs,
} from '../src/infrastructure/http/api-docs/api-document';
import { listRoutes } from '../src/infrastructure/http/api-docs/route-catalog';
import { createAccountTestApp } from './support/create-account-test-app';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function operations(
  document: OpenAPIObject,
): Array<{ id: string; operation: OperationObject }> {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = item[method];
      return operation
        ? [{ id: `${method.toUpperCase()} ${path}`, operation }]
        : [];
    }),
  );
}

function jsonSchemaOf(operation: OperationObject, status: number): unknown {
  const response = operation.responses[status] as ResponseObject | undefined;
  return response?.content?.['application/json']?.schema;
}

describe('API docs (e2e)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    ({ app } = await createAccountTestApp());
    document = buildApiDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents every route the app exposes', () => {
    const documented = new Set(operations(document).map(({ id }) => id));
    const routes = listRoutes(app).map(
      ({ method, path }) => `${method.toUpperCase()} ${path}`,
    );

    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((route) => !documented.has(route))).toEqual([]);
  });

  // Guards the rule in CLAUDE.md: a new or changed route must ship with its
  // summary and a documented success response.
  it('gives every operation a summary and a described success response', () => {
    const missing = operations(document).flatMap(({ id, operation }) => {
      const success = Object.entries(operation.responses).filter(
        ([status, response]) =>
          status.startsWith('2') &&
          ((response as ResponseObject).description ?? '') !== '',
      );
      return !operation.summary || success.length === 0 ? [id] : [];
    });

    expect(missing).toEqual([]);
  });

  it('marks protected routes with bearer auth, roles, 401 and 403', () => {
    const invite = document.paths['/users/invitations'].post!;
    expect(invite.security).toEqual([{ bearer: [] }]);
    expect(invite).toMatchObject({ 'x-roles': ['owner'] });
    expect(invite.description).toContain('**Acesso:** Dono.');
    expect(invite.responses).toHaveProperty('401');
    expect(invite.responses).toHaveProperty('403');

    const me = document.paths['/me'].get!;
    expect(me).toMatchObject({ 'x-roles': ['owner', 'barber'] });
    expect(me.description).toContain('**Acesso:** Dono, Barbeiro.');
    expect(me.responses).not.toHaveProperty('403');
  });

  it('marks public routes without security', () => {
    const login = document.paths['/auth/login'].post!;
    expect(login.security).toBeUndefined();
    expect(login.description).toContain('**Acesso:** público');
    expect(login.responses).not.toHaveProperty('403');
  });

  it('derives the request body and 400 from the Zod validation pipe', () => {
    const signup = document.paths['/auth/signup'].post!;
    expect(signup.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: expect.arrayContaining([
              'barbershopName',
              'ownerName',
              'email',
              'phone',
              'password',
            ]) as unknown,
          },
        },
      },
    });
    expect(jsonSchemaOf(signup, 400)).toMatchObject({
      properties: { errors: { type: 'array' } },
    });
  });

  it('derives path parameters from the Zod validation pipe', () => {
    const remove = document.paths['/users/{id}'].delete!;
    expect(remove.parameters).toEqual([
      expect.objectContaining({
        name: 'id',
        in: 'path',
        required: true,
        schema: expect.objectContaining({ format: 'uuid' }) as unknown,
      }),
    ]);
  });

  it('documents the response payload from the presenter schema', () => {
    const settings = document.paths['/settings/barbershop'].get!;
    expect(jsonSchemaOf(settings, 200)).toMatchObject({
      required: ['name', 'address', 'timezone', 'openingHours'],
    });
  });

  it('CA-13.1 (C34): documents the WhatsApp connection routes and the webhook', () => {
    const connect = document.paths['/whatsapp/connection'].post!;
    const show = document.paths['/whatsapp/connection'].get!;
    const hook = document.paths['/webhooks/whatsapp/evolution'].post!;

    for (const operation of [connect, show, hook]) {
      expect(operation.summary).toContain('US-13');
    }
    // US-21: every authenticated write also answers 402 while suspended.
    expect(Object.keys(connect.responses).sort()).toEqual(
      ['200', '401', '402', '403', '409', '502'].sort(),
    );
    expect(Object.keys(show.responses).sort()).toEqual(['200', '401', '403']);
    expect(Object.keys(hook.responses).sort()).toEqual(['204', '400', '401']);
    expect(hook.security).toBeUndefined();
    expect(connect.security).toEqual([{ bearer: [] }]);
    expect(show.security).toEqual([{ bearer: [] }]);
  });

  it('CA-14.1 (C24): describes the messages.upsert handling of the webhook', () => {
    const hook = document.paths['/webhooks/whatsapp/evolution'].post!;

    expect(hook.description).toContain('messages.upsert');
    expect(hook.summary).toContain('US-14');
    expect(hook.description).toContain('(US-14)');
  });

  it('US-15 (C28): describes the answers to client questions on the webhook', () => {
    const hook = document.paths['/webhooks/whatsapp/evolution'].post!;

    expect(hook.summary).toContain('US-15');
    expect(hook.description).toContain('US-15');
  });

  it.each([
    ['get', '/whatsapp/conversations/waiting-human', '200', ['401', '403']],
    [
      'post',
      '/whatsapp/conversations/{clientId}/resume',
      '204',
      ['400', '401', '403', '404'],
    ],
  ] as const)(
    'US-16 (C27): documents %s %s for the Owner only',
    (method, path, success, errors) => {
      const operation = document.paths[path][method]!;

      expect(operation.summary).toContain('US-16');
      expect(operation).toMatchObject({ 'x-roles': ['owner'] });
      expect(operation.security).toEqual([{ bearer: [] }]);
      for (const status of [success, ...errors]) {
        expect(
          (operation.responses[status] as ResponseObject).description,
        ).toEqual(expect.any(String));
      }
      if (success === '200') {
        expect(jsonSchemaOf(operation, 200)).toBeDefined();
      }
      if (path.endsWith('/resume')) {
        expect(JSON.stringify(operation.responses['404'])).toContain(
          'Cliente não encontrado.',
        );
      }
    },
  );

  it('US-16 (C27): describes the hand-off on the webhook', () => {
    const hook = document.paths['/webhooks/whatsapp/evolution'].post!;

    expect(hook.summary).toContain('US-16');
    expect(hook.description).toContain('US-16');
  });

  it('US-23 (C17): describes the add-on suggestion on the webhook', () => {
    const hook = document.paths['/webhooks/whatsapp/evolution'].post!;

    expect(hook.description).toContain('US-23');
  });

  it('US-24 (C28): describes the waitlist on the webhook', () => {
    const hook = document.paths['/webhooks/whatsapp/evolution'].post!;

    expect(hook.description).toContain('US-24');
  });

  it('US-17 (C36): describes the booking on the webhook and the blocked_client reason', () => {
    const hook = document.paths['/webhooks/whatsapp/evolution'].post!;
    expect(hook.description).toContain('US-17');

    const list = document.paths['/whatsapp/conversations/waiting-human'].get!;
    const schema = jsonSchemaOf(list, 200) as {
      properties: {
        conversations: {
          items: { properties: { reason: { enum: string[] } } };
        };
      };
    };
    expect(
      schema.properties.conversations.items.properties.reason.enum,
    ).toEqual([
      'requested',
      'not_understood',
      'blocked_client',
      'late_cancellation',
    ]);
  });

  describe('US-18', () => {
    type WithStatus = { properties: { status: { enum: string[] } } };
    const STATUSES = ['confirmed', 'attended', 'no_show', 'cancelled'];

    it('AC 25 (C31): documents the 409 of a cancelled appointment on the attendance route', () => {
      const route = document.paths['/appointments/{id}/status'].patch!;

      expect(Object.keys(route.responses)).toContain('409');
      expect(jsonSchemaOf(route, 409)).toMatchObject({
        example: { message: 'Esse agendamento foi cancelado.' },
      });
    });

    it('AC 25 (C31): documents the cancelled status on the schedule and the client profile', () => {
      const schedule = jsonSchemaOf(
        document.paths['/appointments'].get!,
        200,
      ) as { properties: { appointments: { items: WithStatus } } };
      const profile = jsonSchemaOf(
        document.paths['/clients/{id}'].get!,
        200,
      ) as { properties: { upcomingAppointments: { items: WithStatus } } };

      expect(
        schedule.properties.appointments.items.properties.status.enum,
      ).toEqual(STATUSES);
      expect(
        profile.properties.upcomingAppointments.items.properties.status.enum,
      ).toEqual(STATUSES);
    });

    it('AC 25 (C31): documents the late_cancellation reason and the US-18 webhook behaviour', () => {
      const list = document.paths['/whatsapp/conversations/waiting-human'].get!;
      const schema = jsonSchemaOf(list, 200) as {
        properties: {
          conversations: {
            items: { properties: { reason: { enum: string[] } } };
          };
        };
      };

      expect(
        schema.properties.conversations.items.properties.reason.enum,
      ).toEqual([
        'requested',
        'not_understood',
        'blocked_client',
        'late_cancellation',
      ]);
      expect(
        document.paths['/webhooks/whatsapp/evolution'].post!.description,
      ).toContain('US-18');
    });
  });

  describe('US-19', () => {
    type Item = {
      properties: Record<string, Record<string, unknown> | undefined>;
    };

    it('AC 24, door 4 (C32): documents unconfirmed on the schedule and clientConfirmedAt on the appointment format', () => {
      const schedule = jsonSchemaOf(
        document.paths['/appointments'].get!,
        200,
      ) as { properties: { appointments: { items: Item } } };
      const profile = jsonSchemaOf(
        document.paths['/clients/{id}'].get!,
        200,
      ) as { properties: { upcomingAppointments: { items: Item } } };
      const item = schedule.properties.appointments.items.properties;
      const profileItem =
        profile.properties.upcomingAppointments.items.properties;

      expect(item.unconfirmed).toMatchObject({
        type: 'boolean',
        example: false,
        description: expect.stringContaining('CA-19.5') as string,
      });
      for (const confirmedAt of [
        item.clientConfirmedAt,
        profileItem.clientConfirmedAt,
      ]) {
        expect(confirmedAt).toMatchObject({
          type: 'string',
          format: 'date-time',
          nullable: true,
          example: '2026-09-29T15:00:00.000Z',
          description: expect.stringContaining('CA-19.2') as string,
        });
      }
      expect(profileItem.unconfirmed).toBeUndefined();
    });
  });

  describe('US-21', () => {
    const SUSPENDED_WRITE =
      'A assinatura desta barbearia está inativa. O painel está em modo leitura até a assinatura ser regularizada.';
    const WRITES = ['POST', 'PUT', 'PATCH', 'DELETE'];
    const EXEMPT = ['POST /subscription/checkout', 'POST /subscription/cancel'];

    it('AC 19 (C23): documents the 402 on every authenticated write but the subscription routes, and nowhere else', () => {
      const expected: string[] = [];
      const documented: string[] = [];
      for (const { id, operation } of operations(document)) {
        const method = id.split(' ')[0];
        const authenticated = (operation.security ?? []).length > 0;
        if (authenticated && WRITES.includes(method) && !EXEMPT.includes(id)) {
          expected.push(id);
        }
        const response = operation.responses[402] as ResponseObject | undefined;
        if (!response) continue;
        documented.push(id);
        expect(response.content?.['application/json']?.schema).toMatchObject({
          example: { message: SUSPENDED_WRITE },
        });
      }

      expect(expected).toEqual(
        expect.arrayContaining([
          'POST /settings/services',
          'DELETE /users/{id}',
        ]),
      );
      expect(documented.sort()).toEqual(expected.sort());
      for (const id of EXEMPT) expect(documented).not.toContain(id);
    });
  });

  it('serves the UI and the JSON document once enabled', async () => {
    const docsApp = (await createAccountTestApp([], setupApiDocs)).app;

    await request(docsApp.getHttpServer()).get('/docs').expect(200);
    const response = await request(docsApp.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const served = response.body as OpenAPIObject;
    expect(served.openapi).toMatch(/^3\./);
    expect(served.paths).toHaveProperty(['/auth/signup']);

    await docsApp.close();
  });
});

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
    expect(Object.keys(connect.responses).sort()).toEqual(
      ['200', '401', '403', '409', '502'].sort(),
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

import { INestApplication } from '@nestjs/common';
import { PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ModulesContainer, Reflector } from '@nestjs/core';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  API_DOCS_JSON_PATH,
  buildApiDocument,
  setupApiDocs,
} from '../src/infrastructure/http/api-docs';
import { SESSION_SECURITY_SCHEME } from '../src/interface-adapters/controllers/openapi/api-docs.decorators';
import { IS_PUBLIC_KEY } from '../src/interface-adapters/controllers/public.decorator';
import { createAccountTestApp } from './support/create-account-test-app';

interface Route {
  operationId: string;
  isPublic: boolean;
  readsBody: boolean;
}

// Every handler of every registered controller, so a new route can't ship
// without showing up in the checks below.
function registeredRoutes(app: INestApplication): Route[] {
  const reflector = new Reflector();
  const routes: Route[] = [];

  for (const module of app.get(ModulesContainer).values()) {
    for (const { metatype } of module.controllers.values()) {
      if (typeof metatype !== 'function') continue;
      const prototype = metatype.prototype as Record<string, unknown>;

      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[methodName];
        if (typeof handler !== 'function') continue;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;

        const args = (Reflect.getMetadata(
          ROUTE_ARGS_METADATA,
          metatype,
          methodName,
        ) ?? {}) as Record<string, unknown>;

        routes.push({
          operationId: `${metatype.name}_${methodName}`,
          isPublic:
            reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
              handler,
              metatype,
            ]) === true,
          readsBody: Object.keys(args).some((key) =>
            key.startsWith(`${RouteParamtypes.BODY}:`),
          ),
        });
      }
    }
  }

  return routes;
}

function operationsById(document: OpenAPIObject): Map<string, OperationObject> {
  const operations = new Map<string, OperationObject>();
  for (const pathItem of Object.values(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = pathItem[method];
      if (operation?.operationId) {
        operations.set(operation.operationId, operation);
      }
    }
  }
  return operations;
}

describe('OpenAPI documentation (e2e)', () => {
  let app: INestApplication<App>;
  let routes: Route[];
  let operations: Map<string, OperationObject>;

  beforeAll(async () => {
    ({ app } = await createAccountTestApp({ beforeInit: setupApiDocs }));
    routes = registeredRoutes(app);
    operations = operationsById(buildApiDocument(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the OpenAPI document as JSON', async () => {
    const response = await request(app.getHttpServer())
      .get(`/${API_DOCS_JSON_PATH}`)
      .expect(200);

    expect(response.body).toMatchObject({
      openapi: expect.any(String) as string,
      components: {
        securitySchemes: {
          [SESSION_SECURITY_SCHEME]: { type: 'http', scheme: 'bearer' },
        },
      },
    });
  });

  it('finds the registered routes', () => {
    expect(routes.map((route) => route.operationId)).toEqual(
      expect.arrayContaining(['AuthController_signup', 'MeController_show']),
    );
  });

  it('documents every route with a tag, a summary and a success response', () => {
    for (const { operationId } of routes) {
      const operation = operations.get(operationId);

      expect({ operationId, documented: operation !== undefined }).toEqual({
        operationId,
        documented: true,
      });
      expect({ operationId, tags: operation?.tags?.length ?? 0 }).toEqual({
        operationId,
        tags: 1,
      });
      expect({ operationId, summary: Boolean(operation?.summary) }).toEqual({
        operationId,
        summary: true,
      });
      const statuses = Object.keys(operation?.responses ?? {});
      expect({
        operationId,
        success: statuses.some((status) => status.startsWith('2')),
      }).toEqual({ operationId, success: true });
    }
  });

  it('documents the request body of every route that reads one', () => {
    for (const { operationId, readsBody } of routes) {
      if (!readsBody) continue;
      const requestBody = operations.get(operationId)?.requestBody;

      expect({
        operationId,
        documentsBody:
          requestBody !== undefined &&
          'content' in requestBody &&
          'application/json' in requestBody.content,
      }).toEqual({ operationId, documentsBody: true });
    }
  });

  it('marks every non-public route as requiring the session token and documents its 401', () => {
    for (const { operationId, isPublic } of routes) {
      const operation = operations.get(operationId);
      const requiresSession = (operation?.security ?? []).some(
        (requirement) => SESSION_SECURITY_SCHEME in requirement,
      );

      expect({ operationId, requiresSession }).toEqual({
        operationId,
        requiresSession: !isPublic,
      });
      if (isPublic) continue;
      expect({
        operationId,
        documents401: '401' in (operation?.responses ?? {}),
      }).toEqual({ operationId, documents401: true });
    }
  });
});

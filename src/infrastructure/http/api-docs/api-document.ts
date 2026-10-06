import { HttpStatus, INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type OperationObject,
  type ParameterObject,
  type ResponseObject,
  type SchemaObject,
} from '@nestjs/swagger';
import type { ZodType } from 'zod';
import type { UserRole } from '../../../domain/entities/user';
import {
  messageResponseSchema,
  validationErrorResponseSchema,
} from '../../../interface-adapters/controllers/api-docs/message-response.schema';
import { toOpenApiSchema } from '../../../interface-adapters/controllers/api-docs/openapi-schema';
import {
  READ_ONLY_WRITE_METHODS,
  SUSPENDED_WRITE_MESSAGE,
} from '../subscription-access.guard';
import { CatalogedRoute, listRoutes } from './route-catalog';

export const API_DOCS_PATH = 'docs';
const BEARER_AUTH = 'bearer';

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Dono',
  barber: 'Barbeiro',
};

const API_DESCRIPTION = [
  'API do painel web do BarberBot.',
  '',
  '- **Autenticação:** envie o `accessToken` de `/auth/login` no header `Authorization: Bearer <token>`. A barbearia (tenant) vem sempre da sessão, nunca do payload (RN-26).',
  '- **Perfis:** cada operação diz em **Acesso** quais perfis a usam; os demais recebem 403.',
  '- **Assinatura inativa (US-21):** com a barbearia suspensa, toda operação autenticada de escrita responde 402 e o painel fica em modo leitura; as rotas de `/subscription` continuam abertas para regularizar.',
  '- **Diagnóstico:** toda resposta traz o header `x-request-id`; envie o seu para correlacionar logs.',
  '- **Datas** em UTC (ISO 8601) e **dinheiro** em centavos (inteiro).',
].join('\n');

export function buildApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('BarberBot API')
    .setDescription(API_DESCRIPTION)
    .setVersion('0.0.1')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      BEARER_AUTH,
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);

  for (const route of listRoutes(app)) {
    const operation = document.paths[route.path]?.[route.method as 'get'];
    if (!operation) continue;
    describeInputs(operation, route);
    describeAccess(operation, route);
  }

  return document;
}

export function setupApiDocs(app: INestApplication): void {
  SwaggerModule.setup(API_DOCS_PATH, app, () => buildApiDocument(app), {
    customSiteTitle: 'BarberBot API',
    swaggerOptions: { persistAuthorization: true },
  });
}

function describeInputs(
  operation: OperationObject,
  route: CatalogedRoute,
): void {
  if (route.body) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': { schema: toOpenApiSchema(route.body, 'input') },
      },
    };
  }

  const parameters = [
    ...parametersFrom(route.params, 'path'),
    ...parametersFrom(route.query, 'query'),
  ];
  if (parameters.length > 0) {
    const replaced = new Set(parameters.map((p) => `${p.in}:${p.name}`));
    operation.parameters = [
      ...(operation.parameters ?? []).filter(
        (p) => !('in' in p) || !replaced.has(`${p.in}:${p.name}`),
      ),
      ...parameters,
    ];
  }

  if (route.body || route.params || route.query) {
    addResponse(operation, HttpStatus.BAD_REQUEST, {
      description: 'Payload inválido; `errors` aponta cada campo.',
      schema: toOpenApiSchema(validationErrorResponseSchema, 'output'),
    });
  }
}

function parametersFrom(
  schema: ZodType | undefined,
  location: 'path' | 'query',
): ParameterObject[] {
  if (!schema) return [];
  const { properties = {}, required = [] } = toOpenApiSchema(schema, 'input');
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === 'path' || required.includes(name),
    schema: property,
  }));
}

function describeAccess(
  operation: OperationObject,
  route: CatalogedRoute,
): void {
  if (route.isPublic) {
    appendDescription(operation, '**Acesso:** público, sem autenticação.');
    return;
  }

  const labels = route.roles.map((role) => ROLE_LABELS[role]);
  appendDescription(operation, `**Acesso:** ${labels.join(', ')}.`);
  operation.security = [{ [BEARER_AUTH]: [] }];
  Object.assign(operation, { 'x-roles': route.roles });

  addResponse(operation, HttpStatus.UNAUTHORIZED, {
    description: 'Sem token, token inválido ou expirado, ou usuário removido.',
    schema: messageSchema('Sessão inválida ou expirada.'),
  });

  if (
    READ_ONLY_WRITE_METHODS.includes(route.method.toUpperCase()) &&
    !route.allowWhileSuspended
  ) {
    addResponse(operation, HttpStatus.PAYMENT_REQUIRED, {
      description:
        'A barbearia está suspensa por assinatura inativa (`suspensionReason` em `GET /me`); o painel está em modo leitura (US-21).',
      schema: messageSchema(SUSPENDED_WRITE_MESSAGE),
    });
  }

  const deniedRoles = Object.keys(ROLE_LABELS).filter(
    (role) => !route.roles.includes(role as UserRole),
  );
  if (deniedRoles.length === 0) return;
  addResponse(operation, HttpStatus.FORBIDDEN, {
    description: `O perfil da sessão não tem acesso (${deniedRoles
      .map((role) => ROLE_LABELS[role as UserRole])
      .join(', ')}).`,
    schema: messageSchema('Acesso negado.'),
  });
}

function messageSchema(example: string): SchemaObject {
  return {
    ...toOpenApiSchema(messageResponseSchema, 'output'),
    example: { message: example },
  };
}

function appendDescription(operation: OperationObject, text: string): void {
  operation.description = operation.description
    ? `${operation.description}\n\n${text}`
    : text;
}

// A status already documented by the controller (e.g. a domain 400) is kept,
// and the generated shape is offered as an alternative.
function addResponse(
  operation: OperationObject,
  status: HttpStatus,
  { description, schema }: { description: string; schema: SchemaObject },
): void {
  const existing = operation.responses[status] as ResponseObject | undefined;
  const existingSchema = existing?.content?.['application/json']?.schema;
  if (!existing || !existingSchema) {
    operation.responses[status] = {
      description,
      content: { 'application/json': { schema } },
    };
    return;
  }

  operation.responses[status] = {
    description: `${existing.description} Ou: ${description}`,
    content: {
      'application/json': { schema: { oneOf: [existingSchema, schema] } },
    },
  };
}

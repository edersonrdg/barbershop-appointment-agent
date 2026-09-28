import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { SESSION_SECURITY_SCHEME } from '../../interface-adapters/controllers/openapi/api-docs.decorators';

export const API_DOCS_PATH = 'docs';
export const API_DOCS_JSON_PATH = 'docs/openapi.json';

export function buildApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('BarberBot API')
    .setDescription(
      'API do painel da barbearia. Rotas protegidas exigem o `accessToken` de `/auth/login` ou `/auth/signup` em `Authorization: Bearer <token>`; a barbearia (tenant) vem sempre do token.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      SESSION_SECURITY_SCHEME,
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupApiDocs(app: INestApplication): void {
  SwaggerModule.setup(API_DOCS_PATH, app, () => buildApiDocument(app), {
    jsonDocumentUrl: API_DOCS_JSON_PATH,
    yamlDocumentUrl: 'docs/openapi.yaml',
  });
}

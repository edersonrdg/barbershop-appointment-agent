import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';
import type { ZodType } from 'zod';
import {
  messageResponseSchema,
  validationErrorResponseSchema,
} from './error-response.schemas';
import { toOpenApiSchema } from './to-openapi-schema';

export const SESSION_SECURITY_SCHEME = 'session';

const VALIDATION_ERROR_EXAMPLE = {
  message: 'Dados inválidos.',
  errors: [{ field: 'email', message: 'Informe um e-mail válido.' }],
};

export const ApiZodBody = (schema: ZodType) =>
  ApiBody({ schema: toOpenApiSchema(schema, 'input') });

export const ApiZodResponse = (
  status: HttpStatus,
  description: string,
  schema?: ZodType,
  example?: unknown,
) =>
  ApiResponse({
    status,
    description,
    ...(schema && {
      schema: { ...toOpenApiSchema(schema, 'output'), example },
    }),
  });

export const ApiMessageResponse = (
  status: HttpStatus,
  description: string,
  message: string,
) => ApiZodResponse(status, description, messageResponseSchema, { message });

// OpenAPI keeps one response per status, so a domain error that also maps to
// 400 is documented as an alternative body of the same response.
export const ApiValidationErrorResponse = (domainError?: {
  description: string;
  message: string;
}) => {
  const validation = toOpenApiSchema(validationErrorResponseSchema, 'output');
  const description = 'Payload inválido. Lista cada campo rejeitado.';
  if (!domainError) {
    return ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description,
      schema: { ...validation, example: VALIDATION_ERROR_EXAMPLE },
    });
  }

  return ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: `${description} Ou: ${domainError.description}`,
    schema: {
      oneOf: [validation, toOpenApiSchema(messageResponseSchema, 'output')],
    },
    examples: {
      validation: {
        summary: 'Payload inválido',
        value: VALIDATION_ERROR_EXAMPLE,
      },
      domainError: {
        summary: domainError.description,
        value: { message: domainError.message },
      },
    },
  });
};

// Every route without @Public() goes through SessionGuard, so it needs both
// the security requirement and the 401 the guard returns.
export const ApiSessionAuth = () =>
  applyDecorators(
    ApiBearerAuth(SESSION_SECURITY_SCHEME),
    ApiMessageResponse(
      HttpStatus.UNAUTHORIZED,
      'Token ausente, inválido ou expirado.',
      'Sessão inválida ou expirada.',
    ),
  );

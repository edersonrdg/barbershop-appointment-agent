import type { SchemaObject } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';

// Zod is the single source of truth for payloads, so the OpenAPI schema is
// derived from it instead of being redeclared in DTO classes that could drift.
export function toOpenApiSchema(
  schema: ZodType,
  io: 'input' | 'output',
): SchemaObject {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
  }) as SchemaObject;
}

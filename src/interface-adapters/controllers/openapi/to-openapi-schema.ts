import type { SchemaObject } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';

// The Zod schema that validates (or types) the payload is the single source of
// the documented shape, so the docs can't drift from what the API accepts.
export function toOpenApiSchema(
  schema: ZodType,
  io: 'input' | 'output',
): SchemaObject {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as SchemaObject;
}

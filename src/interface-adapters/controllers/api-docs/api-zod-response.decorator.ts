import { HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { ZodType } from 'zod';
import { toOpenApiSchema } from './openapi-schema';

interface ApiZodResponseOptions {
  status: HttpStatus;
  description: string;
  schema?: ZodType;
}

export const ApiZodResponse = ({
  status,
  description,
  schema,
}: ApiZodResponseOptions) =>
  ApiResponse({
    status,
    description,
    ...(schema && { schema: toOpenApiSchema(schema, 'output') }),
  });

import { HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { messageResponseSchema } from './message-response.schema';
import { toOpenApiSchema } from './openapi-schema';

export const ApiErrorResponse = (
  status: HttpStatus,
  description: string,
  message: string,
) =>
  ApiResponse({
    status,
    description,
    schema: {
      ...toOpenApiSchema(messageResponseSchema, 'output'),
      example: { message },
    },
  });

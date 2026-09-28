import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { ValidationErrorResponse } from './api-docs/message-response.schema';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  // Public so the API docs can derive the request schema from the same source
  // that validates it.
  constructor(readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const body: ValidationErrorResponse = {
      message: 'Dados inválidos.',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
    throw new BadRequestException(body);
  }
}

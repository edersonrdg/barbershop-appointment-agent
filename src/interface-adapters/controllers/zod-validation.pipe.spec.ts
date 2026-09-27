import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  name: z.string().min(2, 'Nome muito curto.'),
  contact: z.object({
    email: z.email('E-mail inválido.'),
  }),
});

function captureError(pipe: ZodValidationPipe<unknown>, value: unknown) {
  try {
    pipe.transform(value);
  } catch (error) {
    return error;
  }
  throw new Error('expected the pipe to throw');
}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('CA-01.1: an invalid payload throws 400 listing every invalid field', () => {
    const error = captureError(pipe, {
      name: 'J',
      contact: { email: 'not-an-email' },
    });

    expect(error).toBeInstanceOf(BadRequestException);
    const exception = error as BadRequestException;
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      message: 'Dados inválidos.',
      errors: [
        { field: 'name', message: 'Nome muito curto.' },
        { field: 'contact.email', message: 'E-mail inválido.' },
      ],
    });
  });

  it('CA-01.1: a missing field is listed as invalid', () => {
    const error = captureError(pipe, { contact: { email: 'a@b.com' } });

    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: 'Dados inválidos.',
      errors: [{ field: 'name' }],
    });
  });

  it('returns the parsed data without extra fields for a valid payload', () => {
    const result = pipe.transform({
      name: 'José',
      contact: { email: 'dono@barbearia.com', card: '4111' },
      role: 'admin',
      barbershopId: 'other',
    });

    expect(result).toEqual({
      name: 'José',
      contact: { email: 'dono@barbearia.com' },
    });
  });
});

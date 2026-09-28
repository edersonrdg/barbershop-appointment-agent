import { z } from 'zod';

const PASSWORD_MESSAGE = 'A senha deve ter entre 8 e 72 caracteres.';

export const passwordField = z
  .string({ error: PASSWORD_MESSAGE })
  .min(8, PASSWORD_MESSAGE)
  .max(72, PASSWORD_MESSAGE)
  .meta({ example: 'senha-secreta-123' });

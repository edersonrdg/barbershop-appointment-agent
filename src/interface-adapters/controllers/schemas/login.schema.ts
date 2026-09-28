import { z } from 'zod';

// Only the shape is checked here: an e-mail or password that breaks the
// signup rules must still get the generic 401, never a hint about which one.
export const loginSchema = z.object({
  email: z
    .string({ error: 'Informe o e-mail.' })
    .min(1, 'Informe o e-mail.')
    .meta({ example: 'dono@barbearia.com' }),
  password: z
    .string({ error: 'Informe a senha.' })
    .min(1, 'Informe a senha.')
    .max(72, 'A senha deve ter no máximo 72 caracteres.')
    .meta({ example: 'senha-secreta-123' }),
});

export type LoginBody = z.infer<typeof loginSchema>;

import { z } from 'zod';

// Only the shape is checked: a well-formed but unknown or malformed e-mail
// still gets the same 202, so the response never reveals registered e-mails.
export const forgotPasswordSchema = z.object({
  email: z
    .string({ error: 'Informe o e-mail.' })
    .meta({ example: 'dono@barbearia.com' }),
});

export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;

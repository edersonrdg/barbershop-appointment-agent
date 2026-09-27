import { z } from 'zod';
import { passwordField } from './password.field';

// CA-01.5: the new password is validated here, before the use case touches
// the token, so an invalid password never consumes the link.
export const resetPasswordSchema = z.object({
  token: z
    .string({ error: 'Informe o token de redefinição.' })
    .min(1, 'Informe o token de redefinição.'),
  newPassword: passwordField,
});

export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;

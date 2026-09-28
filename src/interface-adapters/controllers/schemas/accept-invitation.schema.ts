import { z } from 'zod';
import { passwordField } from './password.field';

export const acceptInvitationSchema = z.object({
  token: z
    .string({ error: 'Informe o token do convite.' })
    .min(1, 'Informe o token do convite.')
    .meta({ description: 'Token recebido no link do convite por e-mail.' }),
  password: passwordField,
});

export type AcceptInvitationBody = z.infer<typeof acceptInvitationSchema>;
